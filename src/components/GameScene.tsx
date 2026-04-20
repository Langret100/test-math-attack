/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Grid, PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData, ObstacleData, HandPositions, HeadPosition, COLORS, CutDirection } from '../types';
import { PLAYER_Z, SPAWN_Z, MISS_Z, NOTE_SPEED, DIRECTION_VECTORS, NOTE_SIZE, LANE_X_POSITIONS, LAYER_Y_POSITIONS, SONG_BPM, MULTIPLIER_OPTIONS, getMultipleOf, getNonMultipleOf } from '../constants';
import Note from './Note';
import Obstacle from './Obstacle';
import Saber from './Saber';

interface GameSceneProps {
  gameStatus: GameStatus;
  audioRef: React.RefObject<HTMLAudioElement>;
  handPositionsRef: React.MutableRefObject<any>;
  headPositionRef: React.MutableRefObject<HeadPosition>;
  chart: NoteData[];
  obstacles: ObstacleData[];
  currentMultiplier: number; // The active number multiplier (e.g. 5 means hit multiples of 5)
  onNoteHit: (note: NoteData, goodCut: boolean) => void;
  onNoteMiss: (note: NoteData) => void;
  onObstacleHit: () => void;
  onSongEnd: () => void;
  onMultiplierChange: (newMult: number) => void;
}

const BEAT_TIME = 60 / SONG_BPM;

const GameScene: React.FC<GameSceneProps> = ({
  gameStatus,
  audioRef,
  handPositionsRef,
  headPositionRef,
  chart,
  obstacles,
  currentMultiplier,
  onNoteHit,
  onNoteMiss,
  onObstacleHit,
  onSongEnd,
  onMultiplierChange
}) => {
  const [notesState, setNotesState] = useState<NoteData[]>([]);
  const [obstaclesState, setObstaclesState] = useState<ObstacleData[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  const activeNotesRef = useRef<NoteData[]>([]);
  const activeObstaclesRef = useRef<ObstacleData[]>([]);
  const nextNoteIndexRef = useRef(0);
  const nextObsIndexRef = useRef(0);
  const shakeIntensity = useRef(0);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const lastMultiplierChangeRef = useRef(0);
  const obstacleHitCooldown = useRef(0);

  const vecA = useMemo(() => new THREE.Vector3(), []);

  // Initialize notes with proper number values based on multiplier
  useEffect(() => {
    const processedNotes = chart.map(note => {
      if (note.noteType === 'number') {
        const isCorrect = Math.random() < 0.6;
        return {
          ...note,
          numberValue: isCorrect ? getMultipleOf(currentMultiplier) : getNonMultipleOf(currentMultiplier)
        };
      }
      return { ...note };
    });
    setNotesState(processedNotes);
    setObstaclesState([...obstacles]);
    // Reset all active state so notes fly in fresh from the start
    activeNotesRef.current = [];
    activeObstaclesRef.current = [];
    nextNoteIndexRef.current = 0;
    nextObsIndexRef.current = 0;
  }, [chart, obstacles]);

  const handleHit = (note: NoteData, goodCut: boolean) => {
    shakeIntensity.current = goodCut ? 0.2 : 0.1;
    onNoteHit(note, goodCut);
  };

  useFrame((state, delta) => {
    // Beat pulsing
    if (audioRef.current && gameStatus === GameStatus.PLAYING) {
      const time = audioRef.current.currentTime;
      const beatPhase = (time % BEAT_TIME) / BEAT_TIME;
      const pulse = Math.pow(1 - beatPhase, 4);

      if (ambientLightRef.current) ambientLightRef.current.intensity = 0.1 + pulse * 0.3;
      if (spotLightRef.current) spotLightRef.current.intensity = 0.5 + pulse * 1.5;
    }

    // Camera shake
    if (shakeIntensity.current > 0 && cameraRef.current) {
      const shake = shakeIntensity.current;
      cameraRef.current.position.x = (Math.random() - 0.5) * shake;
      cameraRef.current.position.y = 1.8 + (Math.random() - 0.5) * shake;
      cameraRef.current.position.z = 4 + (Math.random() - 0.5) * shake;
      shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, 10 * delta);
      if (shakeIntensity.current < 0.01) {
        shakeIntensity.current = 0;
        cameraRef.current.position.set(0, 1.8, 4);
      }
    }

    if (gameStatus !== GameStatus.PLAYING || !audioRef.current) return;

    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    if (audioRef.current.ended) {
      onSongEnd();
      return;
    }

    // Change number multiplier every 30 seconds
    if (time - lastMultiplierChangeRef.current > 30) {
      lastMultiplierChangeRef.current = time;
      const newMult = MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)];
      onMultiplierChange(newMult);
    }

    const spawnAheadTime = Math.abs(SPAWN_Z - PLAYER_Z) / NOTE_SPEED;

    // Spawn notes
    while (nextNoteIndexRef.current < notesState.length) {
      const nextNote = notesState[nextNoteIndexRef.current];
      if (nextNote.time - spawnAheadTime <= time) {
        activeNotesRef.current.push(nextNote);
        nextNoteIndexRef.current++;
      } else break;
    }

    // Spawn obstacles
    while (nextObsIndexRef.current < obstaclesState.length) {
      const nextObs = obstaclesState[nextObsIndexRef.current];
      if (nextObs.time - spawnAheadTime <= time) {
        activeObstaclesRef.current.push(nextObs);
        nextObsIndexRef.current++;
      } else break;
    }

    const hands = handPositionsRef.current as HandPositions;
    const head = headPositionRef.current as HeadPosition;

    // --- NOTE COLLISION ---
    for (let i = activeNotesRef.current.length - 1; i >= 0; i--) {
      const note = activeNotesRef.current[i];
      if (note.hit || note.missed) continue;

      const timeDiff = note.time - time;
      const currentZ = PLAYER_Z - timeDiff * NOTE_SPEED;

      // Miss check
      if (currentZ > MISS_Z) {
        note.missed = true;
        // For number notes: missing correct ones is a miss; missing wrong ones is fine
        if (note.noteType === 'normal' || note.noteType === 'heart') {
          onNoteMiss(note);
        } else if (note.noteType === 'number') {
          // Only penalize if it was a correct number
          if (note.numberValue !== undefined && note.numberValue % currentMultiplier === 0) {
            onNoteMiss(note);
          }
        }
        activeNotesRef.current.splice(i, 1);
        continue;
      }

      // Collision window: only when note is right in front of player
      if (currentZ > PLAYER_Z - 0.8 && currentZ < PLAYER_Z + 0.5) {
        const noteX = LANE_X_POSITIONS[note.lineIndex];
        const noteY = LAYER_Y_POSITIONS[note.lineLayer];

        const leftPos = hands.left;
        const rightPos = hands.right;
        const leftVel = hands.leftVelocity;
        const rightVel = hands.rightVelocity;

        // XY distance only (ignore Z — blade is long and z alignment is unreliable)
        const HIT_RADIUS_XY = 0.75;
        // Minimum swing speed to register a hit (prevents idle touching)
        const MIN_SWING_SPEED = 1.5;

        let hitHand: 'left' | 'right' | null = null;
        let hitSpeed = 0;

        const leftSpd = leftVel ? leftVel.length() : 0;
        const rightSpd = rightVel ? rightVel.length() : 0;

        if (leftPos) {
          const dx = leftPos.x - noteX;
          const dy = leftPos.y - noteY;
          const dist2D = Math.sqrt(dx * dx + dy * dy);
          if (dist2D < HIT_RADIUS_XY && leftSpd >= MIN_SWING_SPEED) {
            hitHand = 'left';
            hitSpeed = leftSpd;
          }
        }
        if (!hitHand && rightPos) {
          const dx = rightPos.x - noteX;
          const dy = rightPos.y - noteY;
          const dist2D = Math.sqrt(dx * dx + dy * dy);
          if (dist2D < HIT_RADIUS_XY && rightSpd >= MIN_SWING_SPEED) {
            hitHand = 'right';
            hitSpeed = rightSpd;
          }
        }

        if (hitHand !== null) {
          // Color match: normal notes need correct hand; number/heart accept either hand
          const needsColorMatch = note.noteType === 'normal';
          const colorMatch = !needsColorMatch || hitHand === note.type;
          const goodCut = colorMatch && hitSpeed >= MIN_SWING_SPEED;

          note.hit = true;
          note.hitTime = time;
          handleHit(note, goodCut);
          activeNotesRef.current.splice(i, 1);
        }
      }
    }

    // --- OBSTACLE COLLISION (head-based) ---
    if (obstacleHitCooldown.current > 0) {
      obstacleHitCooldown.current -= delta;
    }

    for (let i = activeObstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = activeObstaclesRef.current[i];
      if (obs.hit) continue;

      const timeDiff = obs.time - time;
      const currentZ = PLAYER_Z - timeDiff * NOTE_SPEED;

      // Remove if passed
      if (currentZ > MISS_Z + 2) {
        activeObstaclesRef.current.splice(i, 1);
        continue;
      }

      // Check head collision when obstacle is near
      if (currentZ > PLAYER_Z - 2.0 && currentZ < PLAYER_Z + 1.0) {
        if (head.detected && obstacleHitCooldown.current <= 0) {
          let headHit = false;

          if (obs.obstacleType === 'top') {
            // Top obstacle: head must be below (y > 0.55 in normalized = head too high)
            // In MediaPipe: y increases downward; y < 0.45 = head is too high
            headHit = head.y < 0.45;
          } else if (obs.obstacleType === 'left') {
            // Left obstacle: head must be to the right (x > 0.55)
            // In MediaPipe mirrored: x < 0.45 = head leaning into left wall
            headHit = head.x < 0.45;
          } else if (obs.obstacleType === 'right') {
            // Right obstacle: head must be to the left (x < 0.45)
            headHit = head.x > 0.55;
          }

          if (headHit) {
            obs.hit = true;
            obstacleHitCooldown.current = 2.0; // 2s cooldown to prevent multiple hits
            shakeIntensity.current = 0.8;
            onObstacleHit();
            activeObstaclesRef.current.splice(i, 1);
          }
        }
      }
    }
  });

  const visibleNotes = useMemo(() => {
    return notesState.filter(n =>
      !n.missed &&
      (!n.hit || currentTime - (n.hitTime || 0) < 0.5) &&
      n.time - currentTime < 5 &&
      n.time - currentTime > -2
    );
  }, [notesState, currentTime]);

  const visibleObstacles = useMemo(() => {
    return obstaclesState.filter(o =>
      !o.hit &&
      o.time - currentTime < 5 &&
      o.time - currentTime > -1
    );
  }, [obstaclesState, currentTime]);

  const leftHandPosRef = useRef<THREE.Vector3 | null>(null);
  const rightHandPosRef = useRef<THREE.Vector3 | null>(null);
  const leftHandVelRef = useRef<THREE.Vector3 | null>(null);
  const rightHandVelRef = useRef<THREE.Vector3 | null>(null);

  useFrame(() => {
    leftHandPosRef.current = handPositionsRef.current.left;
    rightHandPosRef.current = handPositionsRef.current.right;
    leftHandVelRef.current = handPositionsRef.current.leftVelocity;
    rightHandVelRef.current = handPositionsRef.current.rightVelocity;
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.8, 4]} fov={60} />
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 10, 50]} />

      <ambientLight ref={ambientLightRef} intensity={0.2} />
      <spotLight ref={spotLightRef} position={[0, 10, 5]} angle={0.5} penumbra={1} intensity={1} castShadow />

      <Environment preset="night" />

      <Grid position={[0, 0, 0]} args={[6, 100]} cellThickness={0.1} cellColor="#333" sectionSize={5} sectionThickness={1.5} sectionColor={COLORS.right} fadeDistance={60} infiniteGrid />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[4, 100]} />
        <meshStandardMaterial color="#111" roughness={0.8} metalness={0.5} />
      </mesh>

      <Stars radius={50} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

      <Saber type="left" positionRef={leftHandPosRef} velocityRef={leftHandVelRef} />
      <Saber type="right" positionRef={rightHandPosRef} velocityRef={rightHandVelRef} />

      {visibleNotes.map(note => (
        <Note
          key={note.id}
          data={note}
          zPos={PLAYER_Z - (note.time - currentTime) * NOTE_SPEED}
          currentTime={currentTime}
        />
      ))}

      {visibleObstacles.map(obs => (
        <Obstacle
          key={obs.id}
          data={obs}
          zPos={PLAYER_Z - (obs.time - currentTime) * NOTE_SPEED}
        />
      ))}
    </>
  );
};

export default GameScene;
