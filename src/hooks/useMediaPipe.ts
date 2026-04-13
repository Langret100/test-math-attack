/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FaceLandmarker, FilesetResolver, HandLandmarkerResult, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { HeadPosition } from '../types';

const mapHandToWorld = (x: number, y: number): THREE.Vector3 => {
  const GAME_X_RANGE = 5;
  const GAME_Y_RANGE = 3.5;
  const Y_OFFSET = 0.8;

  const worldX = (0.5 - x) * GAME_X_RANGE;
  const worldY = (1.0 - y) * GAME_Y_RANGE - (GAME_Y_RANGE / 2) + Y_OFFSET;
  const worldZ = -Math.max(0, worldY * 0.2);

  return new THREE.Vector3(worldX, Math.max(0.1, worldY), worldZ);
};

export const useMediaPipe = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handPositionsRef = useRef<{
    left: THREE.Vector3 | null;
    right: THREE.Vector3 | null;
    lastLeft: THREE.Vector3 | null;
    lastRight: THREE.Vector3 | null;
    leftVelocity: THREE.Vector3;
    rightVelocity: THREE.Vector3;
    lastTimestamp: number;
  }>({
    left: null,
    right: null,
    lastLeft: null,
    lastRight: null,
    leftVelocity: new THREE.Vector3(0, 0, 0),
    rightVelocity: new THREE.Vector3(0, 0, 0),
    lastTimestamp: 0
  });

  // Head position (normalized 0-1)
  const headPositionRef = useRef<HeadPosition>({
    x: 0.5,
    y: 0.5,
    detected: false
  });

  const lastResultsRef = useRef<HandLandmarkerResult | null>(null);
  const lastFaceResultsRef = useRef<FaceLandmarkerResult | null>(null);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    let isActive = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );

        if (!isActive) return;

        // Hand landmarker
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        // Face landmarker for head dodge
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        if (!isActive) {
          handLandmarker.close();
          faceLandmarker.close();
          return;
        }

        handLandmarkerRef.current = handLandmarker;
        faceLandmarkerRef.current = faceLandmarker;
        startCamera();
      } catch (err: any) {
        console.error("Error initializing MediaPipe:", err);
        setError(`Failed to load tracking: ${err.message}`);
      }
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });

        if (videoRef.current && isActive) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            if (isActive) {
              setIsCameraReady(true);
              predictWebcam();
            }
          };
        }
      } catch (err) {
        console.error("Camera Error:", err);
        setError("Could not access camera.");
      }
    };

    const predictWebcam = () => {
      if (!videoRef.current || !handLandmarkerRef.current || !isActive) return;

      const video = videoRef.current;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        let startTimeMs = performance.now();
        try {
          const handResults = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
          lastResultsRef.current = handResults;
          processHandResults(handResults);

          if (faceLandmarkerRef.current) {
            const faceResults = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);
            lastFaceResultsRef.current = faceResults;
            processFaceResults(faceResults);
          }
        } catch (e) {
          console.warn("Detection failed this frame", e);
        }
      }

      requestRef.current = requestAnimationFrame(predictWebcam);
    };

    const processHandResults = (results: HandLandmarkerResult) => {
      const now = performance.now();
      const deltaTime = (now - handPositionsRef.current.lastTimestamp) / 1000;
      handPositionsRef.current.lastTimestamp = now;

      let newLeft: THREE.Vector3 | null = null;
      let newRight: THREE.Vector3 | null = null;

      if (results.landmarks) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const landmarks = results.landmarks[i];
          const classification = results.handedness[i][0];
          const isRight = classification.categoryName === 'Right';

          const tip = landmarks[8];
          const worldPos = mapHandToWorld(tip.x, tip.y);

          if (isRight) {
            newRight = worldPos;
          } else {
            newLeft = worldPos;
          }
        }
      }

      const s = handPositionsRef.current;
      const LERP = 0.6;

      if (newLeft) {
        if (s.left) {
          newLeft.lerpVectors(s.left, newLeft, LERP);
          if (deltaTime > 0.001) {
            s.leftVelocity.subVectors(newLeft, s.left).divideScalar(deltaTime);
          }
        }
        s.lastLeft = s.left ? s.left.clone() : newLeft.clone();
        s.left = newLeft;
      } else {
        s.left = null;
      }

      if (newRight) {
        if (s.right) {
          newRight.lerpVectors(s.right, newRight, LERP);
          if (deltaTime > 0.001) {
            s.rightVelocity.subVectors(newRight, s.right).divideScalar(deltaTime);
          }
        }
        s.lastRight = s.right ? s.right.clone() : newRight.clone();
        s.right = newRight;
      } else {
        s.right = null;
      }
    };

    const processFaceResults = (results: FaceLandmarkerResult) => {
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        // Nose tip is landmark 1 in FaceLandmarker
        const nose = landmarks[1];
        headPositionRef.current = {
          x: nose.x,
          y: nose.y,
          detected: true
        };
      } else {
        headPositionRef.current = {
          x: 0.5,
          y: 0.5,
          detected: false
        };
      }
    };

    setupMediaPipe();

    return () => {
      isActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (faceLandmarkerRef.current) faceLandmarkerRef.current.close();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [videoRef]);

  return { isCameraReady, handPositionsRef, headPositionRef, lastResultsRef, error };
};
