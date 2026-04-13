/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo, useRef } from 'react';
import { Extrude, Octahedron, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NoteData, COLORS } from '../types';
import { LANE_X_POSITIONS, LAYER_Y_POSITIONS, NOTE_SIZE } from '../constants';

interface NoteProps {
  data: NoteData;
  zPos: number;
  currentTime: number;
}

// 4-pointed star shape
const createSparkShape = (size: number) => {
  const shape = new THREE.Shape();
  const s = size / 1.8;
  shape.moveTo(0, s);
  shape.quadraticCurveTo(0, 0, s, 0);
  shape.quadraticCurveTo(0, 0, 0, -s);
  shape.quadraticCurveTo(0, 0, -s, 0);
  shape.quadraticCurveTo(0, 0, 0, s);
  return shape;
};

// Heart shape
const createHeartShape = (size: number) => {
  const s = size * 0.7;
  const shape = new THREE.Shape();
  shape.moveTo(0, -s * 0.5);
  shape.bezierCurveTo(-s * 1.2, -s * 1.2, -s * 1.5, s * 0.3, 0, s * 0.8);
  shape.bezierCurveTo(s * 1.5, s * 0.3, s * 1.2, -s * 1.2, 0, -s * 0.5);
  return shape;
};

const SPARK_SHAPE = createSparkShape(NOTE_SIZE);
const HEART_SHAPE = createHeartShape(NOTE_SIZE);
const EXTRUDE_SETTINGS = { depth: NOTE_SIZE * 0.4, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 };

// Debris effect on hit
const Debris: React.FC<{ timeSinceHit: number; color: string }> = ({ timeSinceHit, color }) => {
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (groupRef.current) groupRef.current.scale.setScalar(Math.max(0.01, 1 - timeSinceHit * 1.5));
    if (flashRef.current) {
      const flashDuration = 0.15;
      if (timeSinceHit < flashDuration) {
        const t = timeSinceHit / flashDuration;
        flashRef.current.visible = true;
        flashRef.current.scale.setScalar(1 + t * 4);
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      } else {
        flashRef.current.visible = false;
      }
    }
  });

  const flySpeed = 6.0;
  const distance = flySpeed * timeSinceHit;

  const Shard = ({ offsetDir, moveDir, scale = 1 }: { offsetDir: number[]; moveDir: number[]; scale?: number }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
      if (meshRef.current) {
        meshRef.current.position.x = offsetDir[0] + moveDir[0] * distance;
        meshRef.current.position.y = offsetDir[1] + moveDir[1] * distance;
        meshRef.current.position.z = offsetDir[2] + moveDir[2] * distance;
        meshRef.current.rotation.x += moveDir[1] * 0.1 * 10;
        meshRef.current.rotation.y += moveDir[0] * 0.1 * 10;
      }
    });
    return (
      <Octahedron ref={meshRef} args={[NOTE_SIZE * 0.3 * scale]} position={[offsetDir[0], offsetDir[1], offsetDir[2]]}>
        <meshStandardMaterial color={color} roughness={0.1} metalness={0.9} emissive={color} emissiveIntensity={0.5} />
      </Octahedron>
    );
  };

  return (
    <group ref={groupRef}>
      <mesh ref={flashRef}>
        <sphereGeometry args={[NOTE_SIZE * 1.2, 16, 16]} />
        <meshBasicMaterial color="white" transparent toneMapped={false} />
      </mesh>
      <Shard offsetDir={[0, 0.2, 0]} moveDir={[0, 1.5, -0.5]} scale={0.8} />
      <Shard offsetDir={[0.2, 0, 0]} moveDir={[1.5, 0, -0.5]} scale={0.8} />
      <Shard offsetDir={[0, -0.2, 0]} moveDir={[0, -1.5, -0.5]} scale={0.8} />
      <Shard offsetDir={[-0.2, 0, 0]} moveDir={[-1.5, 0, -0.5]} scale={0.8} />
      <Shard offsetDir={[0.1, 0.1, 0.1]} moveDir={[1, 1, 1]} scale={0.5} />
      <Shard offsetDir={[-0.1, -0.1, -0.1]} moveDir={[-1, -1, 1]} scale={0.5} />
    </group>
  );
};

// Rotating number note
const NumberNote: React.FC<{ value: number; color: string; isCorrect?: boolean }> = ({ value, color, isCorrect }) => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 2;
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[NOTE_SIZE * 0.7, 16, 16]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.3}
          transmission={0.1}
        />
      </mesh>
      <Text
        position={[0, 0, NOTE_SIZE * 0.75]}
        fontSize={NOTE_SIZE * 0.6}
        color="white"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {value}
      </Text>
      <Text
        position={[0, 0, -NOTE_SIZE * 0.75]}
        rotation={[0, Math.PI, 0]}
        fontSize={NOTE_SIZE * 0.6}
        color="white"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {value}
      </Text>
      <pointLight color={color} intensity={1.5} distance={2} decay={2} />
    </group>
  );
};

// Heart note 
const HeartNote: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
      groupRef.current.scale.setScalar(pulse);
      groupRef.current.rotation.y += 0.03;
    }
  });
  return (
    <group ref={groupRef}>
      <group position={[0, 0, -NOTE_SIZE * 0.2]}>
        <Extrude args={[HEART_SHAPE, EXTRUDE_SETTINGS]} castShadow>
          <meshPhysicalMaterial
            color={COLORS.heart}
            emissive={COLORS.heart}
            emissiveIntensity={1.2}
            roughness={0.1}
            metalness={0.1}
            transmission={0.2}
          />
        </Extrude>
      </group>
      <pointLight color={COLORS.heart} intensity={2} distance={3} decay={2} />
    </group>
  );
};

const Note: React.FC<NoteProps> = ({ data, zPos, currentTime }) => {
  const color = data.noteType === 'number'
    ? COLORS.number
    : data.noteType === 'heart'
    ? COLORS.heart
    : data.type === 'left' ? COLORS.left : COLORS.right;

  const position: [number, number, number] = useMemo(() => {
    return [LANE_X_POSITIONS[data.lineIndex], LAYER_Y_POSITIONS[data.lineLayer], zPos];
  }, [data.lineIndex, data.lineLayer, zPos]);

  if (data.missed) return null;

  if (data.hit && data.hitTime) {
    return (
      <group position={position}>
        <Debris timeSinceHit={currentTime - data.hitTime} color={color} />
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
            <Extrude args={[SPARK_SHAPE, EXTRUDE_SETTINGS]} castShadow receiveShadow>
              <meshPhysicalMaterial
                color={color}
                roughness={0.2}
                metalness={0.1}
                transmission={0.1}
                thickness={0.5}
                emissive={color}
                emissiveIntensity={0.8}
              />
            </Extrude>
          </group>
          <mesh position={[0, 0, NOTE_SIZE * 0.1]}>
            <octahedronGeometry args={[NOTE_SIZE * 0.2, 0]} />
            <meshBasicMaterial color="white" toneMapped={false} transparent opacity={0.8} />
          </mesh>
          <group position={[0, 0, -NOTE_SIZE * 0.2]}>
            <mesh>
              <extrudeGeometry args={[SPARK_SHAPE, { ...EXTRUDE_SETTINGS, depth: EXTRUDE_SETTINGS.depth * 1.1 }]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.3} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
};

export default React.memo(Note, (prev, next) => {
  if (next.data.hit) return false;
  return prev.zPos === next.zPos && prev.data.hit === next.data.hit && prev.data.missed === next.data.missed;
});
