/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FaceLandmarker, FilesetResolver, HandLandmarkerResult, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { HeadPosition } from '../types';

// Map normalized MediaPipe → game world
// Note positions: X -1.2~1.2, Y 0.8~2.4
const mapToWorld = (x: number, y: number): THREE.Vector3 => {
  const wx = (0.5 - x) * 4.5;       // mirror + scale
  const wy = (1.0 - y) * 3.2 + 0.4; // flip, shift up
  return new THREE.Vector3(wx, wy, 0);
};

// How long (seconds) to keep a "ghost" position after hand disappears
const GHOST_DURATION = 0.12;

export const useMediaPipe = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handPositionsRef = useRef<{
    left: THREE.Vector3 | null;
    right: THREE.Vector3 | null;
    leftVelocity: THREE.Vector3;
    rightVelocity: THREE.Vector3;
    leftWristDir: THREE.Vector3;
    rightWristDir: THREE.Vector3;
    // Ghost tracking: keep last known position briefly when hand disappears
    leftGhostPos: THREE.Vector3 | null;
    rightGhostPos: THREE.Vector3 | null;
    leftGhostAge: number;  // seconds since last real detection
    rightGhostAge: number;
    lastTimestamp: number;
  }>({
    left: null, right: null,
    leftVelocity: new THREE.Vector3(),
    rightVelocity: new THREE.Vector3(),
    leftWristDir: new THREE.Vector3(0, 1, 0),
    rightWristDir: new THREE.Vector3(0, 1, 0),
    leftGhostPos: null, rightGhostPos: null,
    leftGhostAge: 999, rightGhostAge: 999,
    lastTimestamp: 0
  });

  const headPositionRef = useRef<HeadPosition>({ x: 0.5, y: 0.5, detected: false });
  const lastResultsRef = useRef<HandLandmarkerResult | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    let isActive = true;

    const setup = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
        );
        if (!isActive) return;

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          // Low thresholds → catches fast-moving hands better
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4
        });

        if (!isActive) { handLandmarker.close(); faceLandmarker.close(); return; }
        handLandmarkerRef.current = handLandmarker;
        faceLandmarkerRef.current = faceLandmarker;
        startCamera();
      } catch (err: any) {
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
            if (isActive) { setIsCameraReady(true); predict(); }
          };
        }
      } catch {
        setError('Could not access camera.');
      }
    };

    const predict = () => {
      if (!videoRef.current || !handLandmarkerRef.current || !isActive) return;
      const video = videoRef.current;

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const now = performance.now();
        try {
          const handResults = handLandmarkerRef.current.detectForVideo(video, now);
          lastResultsRef.current = handResults;
          processHands(handResults, now);
          if (faceLandmarkerRef.current) {
            processFace(faceLandmarkerRef.current.detectForVideo(video, now));
          }
        } catch (e) {
          // On detection failure, just advance ghost timers
          advanceGhosts(0.016);
        }
      }

      requestRef.current = requestAnimationFrame(predict);
    };

    const advanceGhosts = (dt: number) => {
      const s = handPositionsRef.current;
      s.leftGhostAge += dt;
      s.rightGhostAge += dt;

      // Extrapolate ghost position using last velocity
      if (s.leftGhostAge < GHOST_DURATION && s.leftGhostPos) {
        s.leftGhostPos.addScaledVector(s.leftVelocity, dt * 0.3); // damped extrapolation
        s.left = s.leftGhostPos.clone();
      } else if (s.leftGhostAge >= GHOST_DURATION) {
        s.left = null;
      }

      if (s.rightGhostAge < GHOST_DURATION && s.rightGhostPos) {
        s.rightGhostPos.addScaledVector(s.rightVelocity, dt * 0.3);
        s.right = s.rightGhostPos.clone();
      } else if (s.rightGhostAge >= GHOST_DURATION) {
        s.right = null;
      }
    };

    const processHands = (results: HandLandmarkerResult, now: number) => {
      const s = handPositionsRef.current;
      const deltaTime = Math.max(0.005, (now - s.lastTimestamp) / 1000);
      s.lastTimestamp = now;

      // Advance ghost ages by deltaTime first
      s.leftGhostAge += deltaTime;
      s.rightGhostAge += deltaTime;

      let detectedLeft = false;
      let detectedRight = false;

      if (results.landmarks) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const lm = results.landmarks[i];
          const isRight = results.handedness[i][0].categoryName === 'Right';

          // Palm center: average of wrist(0), index_mcp(5), middle_mcp(9), pinky_mcp(17)
          const pts = [lm[0], lm[5], lm[9], lm[17]];
          const palmX = pts.reduce((a, p) => a + p.x, 0) / pts.length;
          const palmY = pts.reduce((a, p) => a + p.y, 0) / pts.length;
          const newPos = mapToWorld(palmX, palmY);

          // Wrist → middle finger MCP direction for blade orientation
          const wx0 = (0.5 - lm[0].x) * 4.5;
          const wy0 = (1.0 - lm[0].y) * 3.2;
          const wx9 = (0.5 - lm[9].x) * 4.5;
          const wy9 = (1.0 - lm[9].y) * 3.2;
          const dir = new THREE.Vector3(wx9 - wx0, wy9 - wy0, 0).normalize();

          if (isRight) {
            detectedRight = true;
            if (s.right) {
              // Raw velocity — no lerp so fast swings register
              s.rightVelocity.subVectors(newPos, s.right).divideScalar(deltaTime);
              // Clamp velocity magnitude to prevent spikes
              const spd = s.rightVelocity.length();
              if (spd > 40) s.rightVelocity.multiplyScalar(40 / spd);
            } else {
              s.rightVelocity.set(0, 0, 0);
            }
            s.right = newPos;
            s.rightGhostPos = newPos.clone();
            s.rightGhostAge = 0;
            s.rightWristDir = dir;
          } else {
            detectedLeft = true;
            if (s.left) {
              s.leftVelocity.subVectors(newPos, s.left).divideScalar(deltaTime);
              const spd = s.leftVelocity.length();
              if (spd > 40) s.leftVelocity.multiplyScalar(40 / spd);
            } else {
              s.leftVelocity.set(0, 0, 0);
            }
            s.left = newPos;
            s.leftGhostPos = newPos.clone();
            s.leftGhostAge = 0;
            s.leftWristDir = dir;
          }
        }
      }

      // For hands not detected this frame: use ghost extrapolation
      if (!detectedLeft) {
        if (s.leftGhostAge < GHOST_DURATION && s.leftGhostPos) {
          // Extrapolate with damped velocity
          s.leftGhostPos.addScaledVector(s.leftVelocity, deltaTime * 0.4);
          s.left = s.leftGhostPos.clone();
          // Decay velocity so extrapolation slows down
          s.leftVelocity.multiplyScalar(0.7);
        } else {
          s.left = null;
          s.leftVelocity.set(0, 0, 0);
        }
      }

      if (!detectedRight) {
        if (s.rightGhostAge < GHOST_DURATION && s.rightGhostPos) {
          s.rightGhostPos.addScaledVector(s.rightVelocity, deltaTime * 0.4);
          s.right = s.rightGhostPos.clone();
          s.rightVelocity.multiplyScalar(0.7);
        } else {
          s.right = null;
          s.rightVelocity.set(0, 0, 0);
        }
      }
    };

    const processFace = (results: FaceLandmarkerResult) => {
      if (results.faceLandmarks?.length > 0) {
        const nose = results.faceLandmarks[0][1];
        headPositionRef.current = { x: nose.x, y: nose.y, detected: true };
      } else {
        headPositionRef.current = { x: 0.5, y: 0.5, detected: false };
      }
    };

    setup();
    return () => {
      isActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [videoRef]);

  return { isCameraReady, handPositionsRef, headPositionRef, lastResultsRef, error };
};
