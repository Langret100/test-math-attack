/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo, useRef } from 'react';
import { Extrude, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NoteData, COLORS } from '../types';
import { LANE_X_POSITIONS, LAYER_Y_POSITIONS, NOTE_SIZE } from '../constants';

interface NoteProps {
  data: NoteData;
  zPos: number;
  currentTime: number;
}

// ── Slash + particle hit effect ──────────────────────────────────────────
const HitEffect: React.FC<{ timeSinceHit: number; color: string }> = ({ timeSinceHit, color }) => {
  const t = timeSinceHit;
  const fade = Math.max(0, 1 - t * 2.5);
  if (fade <= 0) return null;

  // Slash line particles
  const Slash = ({ angle, len }: { angle: number; len: number }) => {
    const dist = t * 5;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    return (
      <mesh position={[x, y, 0]} rotation={[0, 0, angle]}>
        <boxGeometry args={[len * (1 - t * 1.5), 0.03, 0.03]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={fade} />
      </mesh>
    );
  };

  // Particle sparks
  const Spark = ({ dir, spd }: { dir: number; spd: number }) => {
    const d = t * spd;
    return (
      <mesh position={[Math.cos(dir) * d, Math.sin(dir) * d, 0]}>
        <sphereGeometry args={[0.04 * fade, 6, 6]} />
        <meshBasicMaterial color="white" toneMapped={false} transparent opacity={fade * 0.9} />
      </mesh>
    );
  };

  return (
    <group>
      {/* Flash burst */}
      <mesh>
        <sphereGeometry args={[NOTE_SIZE * 1.5 * (1 - t * 2), 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={Math.max(0, fade * 0.6)} />
      </mesh>
      {/* Slash lines */}
      <Slash angle={Math.PI / 4} len={0.5} />
      <Slash angle={-Math.PI / 4} len={0.4} />
      <Slash angle={Math.PI / 4 * 3} len={0.35} />
      <Slash angle={-Math.PI / 4 * 3} len={0.45} />
      {/* Sparks */}
      {[0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8].map((dir, i) => (
        <Spark key={i} dir={dir * Math.PI} spd={3 + i * 0.3} />
      ))}
    </group>
  );
};

// ── Number note ──────────────────────────────────────────────────────────
const NumberNote: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 1.5; });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[NOTE_SIZE * 0.65, 16, 16]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.5}
          roughness={0.2} metalness={0.3} />
      </mesh>
      <Text position={[0, 0, NOTE_SIZE * 0.7]} fontSize={NOTE_SIZE * 0.55}
        color="white" anchorX="center" anchorY="middle" fontWeight="bold">
        {value}
      </Text>
      <Text position={[0, 0, -NOTE_SIZE * 0.7]} rotation={[0, Math.PI, 0]}
        fontSize={NOTE_SIZE * 0.55} color="white" anchorX="center" anchorY="middle" fontWeight="bold">
        {value}
      </Text>
      <pointLight color={color} intensity={1.5} distance={2} decay={2} />
    </group>
  );
};

// ── Heart note — just a glowing heart shape, no box ──────────────────────
const createHeartShape = (size: number) => {
  const s = size * 0.65;
  const shape = new THREE.Shape();
  shape.moveTo(0, -s * 0.5);
  shape.bezierCurveTo(-s * 1.2, -s * 1.2, -s * 1.5, s * 0.3, 0, s * 0.8);
  shape.bezierCurveTo(s * 1.5, s * 0.3, s * 1.2, -s * 1.2, 0, -s * 0.5);
  return shape;
};
const HEART_SHAPE = createHeartShape(NOTE_SIZE);
const HEART_EXTRUDE = { depth: NOTE_SIZE * 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 };

const HeartNote: React.FC = () => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.12;
      ref.current.scale.setScalar(pulse);
      ref.current.rotation.y += 0.025;
    }
  });
  return (
    <group ref={ref}>
      <group position={[0, 0, -NOTE_SIZE * 0.15]}>
        <Extrude args={[HEART_SHAPE, HEART_EXTRUDE]}>
          <meshPhysicalMaterial
            color={COLORS.heart} emissive={COLORS.heart} emissiveIntensity={1.5}
            roughness={0.1} metalness={0.0} transparent opacity={0.95}
          />
        </Extrude>
      </group>
      <pointLight color={COLORS.heart} intensity={2.5} distance={3} decay={2} />
    </group>
  );
};

// ── Normal note (star shape) ─────────────────────────────────────────────
const createStarShape = (size: number) => {
  const shape = new THREE.Shape();
  const s = size / 1.8;
  shape.moveTo(0, s);
  shape.quadraticCurveTo(0, 0, s, 0);
  shape.quadraticCurveTo(0, 0, 0, -s);
  shape.quadraticCurveTo(0, 0, -s, 0);
  shape.quadraticCurveTo(0, 0, 0, s);
  return shape;
};
const STAR_SHAPE = createStarShape(NOTE_SIZE);
const STAR_EXTRUDE = { depth: NOTE_SIZE * 0.4, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 };

// ── Main Note component ──────────────────────────────────────────────────
const Note: React.FC<NoteProps> = ({ data, zPos, currentTime }) => {
  const color = data.noteType === 'number' ? COLORS.number
    : data.noteType === 'heart' ? COLORS.heart
    : data.type === 'left' ? COLORS.left : COLORS.right;

  const position: [number, number, number] = useMemo(() =>
    [LANE_X_POSITIONS[data.lineIndex], LAYER_Y_POSITIONS[data.lineLayer], zPos],
    [data.lineIndex, data.lineLayer, zPos]
  );

  if (data.missed) return null;

  if (data.hit && data.hitTime) {
    return (
      <group position={position}>
        <HitEffect timeSinceHit={currentTime - data.hitTime} color={color} />
      </group>
    );
  }

  return (
    <group position={position}>
      {data.noteType === 'number' && data.numberValue !== undefined ? (
        <NumberNote value={data.numberValue} color={color} />
      ) : data.noteType === 'heart' ? (
        <HeartNote />
      ) : (
        <>
          <group position={[0, 0, -NOTE_SIZE * 0.2]}>
            <Extrude args={[STAR_SHAPE, STAR_EXTRUDE]}>
              <meshPhysicalMaterial color={color} roughness={0.2} metalness={0.1}
                emissive={color} emissiveIntensity={0.8} />
            </Extrude>
          </group>
          <pointLight color={color} intensity={1.2} distance={2} decay={2} />
        </>
      )}
    </group>
  );
};

export default React.memo(Note, (prev, next) => {
  if (next.data.hit || next.data.missed) return false;
  return prev.zPos === next.zPos;
});
