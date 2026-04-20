/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Grid, PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData, ObstacleData, HandPositions, HeadPosition, COLORS, HitResult } from '../types';
import { PLAYER_Z, SPAWN_Z, MISS_Z, NOTE_SPEED, NOTE_SIZE, LANE_X_POSITIONS, LAYER_Y_POSITIONS, SONG_BPM, MULTIPLIER_OPTIONS, getMultipleOf, getNonMultipleOf } from '../constants';
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
  currentMultiplier: number;
  onNoteHit: (note: NoteData, result: HitResult) => void;
  onNoteMiss: (note: NoteData) => void;
  onObstacleHit: () => void;
  onSongEnd: () => void;
  onMultiplierChange: (newMult: number) => void;
}

const BEAT_TIME = 60 / SONG_BPM;

// Hit detection constants
const HIT_RADIUS_XY = 0.85;   // generous XY radius
const HIT_Z_WINDOW = 1.5;     // total Z window centered on PLAYER_Z
const MIN_SWING_SPEED = 0.8;  // low threshold — velocity decays fast after LERP

const GameScene: React.FC<GameSceneProps> = ({
  gameStatus, audioRef, handPositionsRef, headPositionRef,
  chart, obstacles, currentMultiplier,
  onNoteHit, onNoteMiss, onObstacleHit, onSongEnd, onMultiplierChange
}) => {
  const [currentTime, setCurrentTime] = useState(0);

  // Use refs for note data so collision loop always sees latest values without React state lag
  const notesRef = useRef<NoteData[]>([]);
  const obstaclesDataRef = useRef<ObstacleData[]>([]);
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
  const currentMultiplierRef = useRef(currentMultiplier);

  // Keep multiplier ref in sync
  useEffect(() => { currentMultiplierRef.current = currentMultiplier; }, [currentMultiplier]);

  // Process notes into refs (no React state) so collision sees them immediately
  useEffect(() => {
    const processed = chart.map(note => {
      if (note.noteType === 'number') {
        const isCorrect = Math.random() < 0.6;
        return {
          ...note,
          hit: false, missed: false,
          numberValue: isCorrect ? getMultipleOf(currentMultiplier) : getNonMultipleOf(currentMultiplier)
        };
      }
      return { ...note, hit: false, missed: false };
    });
    notesRef.current = processed;
    obstaclesDataRef.current = obstacles.map(o => ({ ...o, hit: false }));
    activeNotesRef.current = [];
    activeObstaclesRef.current = [];
    nextNoteIndexRef.current = 0;
    nextObsIndexRef.current = 0;
  }, [chart, obstacles]);

  // For rendering — updated each frame
  const [renderNotes, setRenderNotes] = useState<NoteData[]>([]);
  const [renderObstacles, setRenderObstacles] = useState<ObstacleData[]>([]);

  const leftHandPosRef = useRef<THREE.Vector3 | null>(null);
  const rightHandPosRef = useRef<THREE.Vector3 | null>(null);
  const leftHandVelRef = useRef<THREE.Vector3 | null>(null);
  const rightHandVelRef = useRef<THREE.Vector3 | null>(null);
  const leftWristDirRef = useRef<THREE.Vector3 | null>(null);
  const rightWristDirRef = useRef<THREE.Vector3 | null>(null);

  useFrame((_, delta) => {
    // Sync saber refs
    leftHandPosRef.current = handPositionsRef.current.left;
    rightHandPosRef.current = handPositionsRef.current.right;
    leftHandVelRef.current = handPositionsRef.current.leftVelocity;
    rightHandVelRef.current = handPositionsRef.current.rightVelocity;
    leftWristDirRef.current = handPositionsRef.current.leftWristDir ?? null;
    rightWristDirRef.current = handPositionsRef.current.rightWristDir ?? null;

    // Beat lighting
    if (audioRef.current && gameStatus === GameStatus.PLAYING) {
      const t = audioRef.current.currentTime;
      const beatPhase = (t % BEAT_TIME) / BEAT_TIME;
      const pulse = Math.pow(1 - beatPhase, 4);
      if (ambientLightRef.current) ambientLightRef.current.intensity = 0.1 + pulse * 0.3;
      if (spotLightRef.current) spotLightRef.current.intensity = 0.5 + pulse * 1.5;
    }

    // Camera shake
    if (shakeIntensity.current > 0 && cameraRef.current) {
      const s = shakeIntensity.current;
      cameraRef.current.position.x = (Math.random() - 0.5) * s;
      cameraRef.current.position.y = 1.8 + (Math.random() - 0.5) * s;
      cameraRef.current.position.z = 4 + (Math.random() - 0.5) * s;
      shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, 10 * delta);
      if (shakeIntensity.current < 0.01) {
        shakeIntensity.current = 0;
        cameraRef.current.position.set(0, 1.8, 4);
      }
    }

    if (gameStatus !== GameStatus.PLAYING || !audioRef.current) return;

    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    if (audioRef.current.ended) { onSongEnd(); return; }

    // Multiplier change
    if (time - lastMultiplierChangeRef.current > 30) {
      lastMultiplierChangeRef.current = time;
      const newMult = MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)];
      onMultiplierChange(newMult);
    }

    const spawnAheadTime = Math.abs(SPAWN_Z - PLAYER_Z) / NOTE_SPEED;

    // Spawn notes
    while (nextNoteIndexRef.current < notesRef.current.length) {
      const n = notesRef.current[nextNoteIndexRef.current];
      if (n.time - spawnAheadTime <= time) {
        activeNotesRef.current.push(n);
        nextNoteIndexRef.current++;
      } else break;
    }

    // Spawn obstacles
    while (nextObsIndexRef.current < obstaclesDataRef.current.length) {
      const o = obstaclesDataRef.current[nextObsIndexRef.current];
      if (o.time - spawnAheadTime <= time) {
        activeObstaclesRef.current.push(o);
        nextObsIndexRef.current++;
      } else break;
    }

    const hands = handPositionsRef.current as HandPositions;
    const head = headPositionRef.current as HeadPosition;
    const mult = currentMultiplierRef.current;

    let notesChanged = false;

    // --- NOTE COLLISION ---
    for (let i = activeNotesRef.current.length - 1; i >= 0; i--) {
      const note = activeNotesRef.current[i];
      if (note.hit || note.missed) continue;

      const timeDiff = note.time - time;
      const currentZ = PLAYER_Z - timeDiff * NOTE_SPEED;

      // Miss — note flew past player
      if (currentZ > MISS_Z) {
        note.missed = true;
        notesChanged = true;
        if (note.noteType === 'normal' || note.noteType === 'heart') {
          onNoteMiss(note);
        } else if (note.noteType === 'number') {
          // Penalize missing a CORRECT multiple; wrong multiples you should ignore
          if (note.numberValue !== undefined && note.numberValue % mult === 0) {
            onNoteMiss(note);
          }
        }
        activeNotesRef.current.splice(i, 1);
        continue;
      }

      // Hit window
      if (currentZ > PLAYER_Z - HIT_Z_WINDOW / 2 && currentZ < PLAYER_Z + HIT_Z_WINDOW / 2) {
        const noteX = LANE_X_POSITIONS[note.lineIndex];
        const noteY = LAYER_Y_POSITIONS[note.lineLayer];

        const leftPos = hands.left;
        const rightPos = hands.right;
        const leftVel = hands.leftVelocity;
        const rightVel = hands.rightVelocity;

        const leftSpd = leftVel ? leftVel.length() : 0;
        const rightSpd = rightVel ? rightVel.length() : 0;

        let hitHand: 'left' | 'right' | null = null;
        let hitSpeed = 0;

        // Check left hand
        if (leftPos && leftSpd >= MIN_SWING_SPEED) {
          const dx = leftPos.x - noteX;
          const dy = leftPos.y - noteY;
          if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS_XY) {
            hitHand = 'left'; hitSpeed = leftSpd;
          }
        }
        // Check right hand (prefer whichever is faster if both hit)
        if (rightPos && rightSpd >= MIN_SWING_SPEED) {
          const dx = rightPos.x - noteX;
          const dy = rightPos.y - noteY;
          if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS_XY) {
            if (!hitHand || rightSpd > hitSpeed) {
              hitHand = 'right'; hitSpeed = rightSpd;
            }
          }
        }

        if (hitHand !== null) {
          const colorMatch = hitHand === note.type;
          const numberCorrect = note.noteType === 'number'
            ? (note.numberValue !== undefined && note.numberValue % currentMultiplierRef.current === 0)
            : true; // not a number note — irrelevant, treat as true

          const result: HitResult = { colorMatch, numberCorrect };

          note.hit = true;
          note.hitTime = time;
          notesChanged = true;
          shakeIntensity.current = colorMatch ? 0.15 : 0.08;
          onNoteHit(note, result);
          activeNotesRef.current.splice(i, 1);
        }
      }
    }

    // --- OBSTACLE COLLISION ---
    if (obstacleHitCooldown.current > 0) obstacleHitCooldown.current -= delta;

    for (let i = activeObstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = activeObstaclesRef.current[i];
      if (obs.hit) continue;

      const currentZ = PLAYER_Z - (obs.time - time) * NOTE_SPEED;

      if (currentZ > MISS_Z + 2) {
        activeObstaclesRef.current.splice(i, 1);
        continue;
      }

      if (currentZ > PLAYER_Z - 2.0 && currentZ < PLAYER_Z + 1.0) {
        if (head.detected && obstacleHitCooldown.current <= 0) {
          let headHit = false;
          if (obs.obstacleType === 'top') headHit = head.y < 0.45;
          else if (obs.obstacleType === 'left') headHit = head.x < 0.45;
          else if (obs.obstacleType === 'right') headHit = head.x > 0.55;

          if (headHit) {
            obs.hit = true;
            obstacleHitCooldown.current = 2.0;
            shakeIntensity.current = 0.8;
            onObstacleHit();
            activeObstaclesRef.current.splice(i, 1);
          }
        }
      }
    }

    // Update render state
    const visible = notesRef.current.filter(n =>
      !n.missed &&
      (!n.hit || time - (n.hitTime || 0) < 0.5) &&
      n.time - time < 5 &&
      n.time - time > -2
    );
    setRenderNotes([...visible]);

    const visObs = obstaclesDataRef.current.filter(o =>
      !o.hit && o.time - time < 5 && o.time - time > -1
    );
    setRenderObstacles([...visObs]);
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.8, 4]} fov={60} />
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 10, 50]} />

      <ambientLight ref={ambientLightRef} intensity={0.2} />
      <spotLight ref={spotLightRef} position={[0, 10, 5]} angle={0.5} penumbra={1} intensity={1} castShadow />

      <Environment preset="night" />

      <Grid position={[0, 0, 0]} args={[6, 100]} cellThickness={0.1} cellColor="#333"
        sectionSize={5} sectionThickness={1.5} sectionColor={COLORS.right}
        fadeDistance={60} infiniteGrid />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[4, 100]} />
        <meshStandardMaterial color="#111" roughness={0.8} metalness={0.5} />
      </mesh>

      <Stars radius={50} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

      <Saber type="left" positionRef={leftHandPosRef} velocityRef={leftHandVelRef} wristDirRef={leftWristDirRef} />
      <Saber type="right" positionRef={rightHandPosRef} velocityRef={rightHandVelRef} wristDirRef={rightWristDirRef} />

      {renderNotes.map(note => (
        <Note
          key={note.id}
          data={note}
          zPos={PLAYER_Z - (note.time - currentTime) * NOTE_SPEED}
          currentTime={currentTime}
        />
      ))}

      {renderObstacles.map(obs => (
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
