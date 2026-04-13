/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ObstacleData, COLORS } from '../types';

interface ObstacleProps {
  data: ObstacleData;
  zPos: number;
}

// Warning flash on hit
const HitFlash: React.FC<{ color: string }> = ({ color }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      const t = (Math.sin(state.clock.elapsedTime * 20) + 1) / 2;
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = t * 0.8;
    }
  });
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[3, 0.3, 0.1]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
};

const Obstacle: React.FC<ObstacleProps> = ({ data, zPos }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      // Pulsing glow
      const pulse = 0.7 + Math.sin(state.clock.elapsedTime * 5) * 0.3;
      groupRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = pulse;
          }
        }
      });
    }
  });

  const color = COLORS.obstacle;

  if (data.obstacleType === 'top') {
    // Top obstacle: wide horizontal bar that forces head down
    return (
      <group ref={groupRef} position={[0, 2.8, zPos]}>
        {/* Main wall */}
        <mesh>
          <boxGeometry args={[4.5, 0.5, 0.3]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            roughness={0.3}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </mesh>
        {/* Warning stripes */}
        {[-1.5, -0.5, 0.5, 1.5].map((x, i) => (
          <mesh key={i} position={[x, -0.15, 0.16]}>
            <planeGeometry args={[0.3, 0.2]} />
            <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} />
          </mesh>
        ))}
        {/* Arrow pointing DOWN */}
        <mesh position={[0, -0.4, 0.16]}>
          <coneGeometry args={[0.3, 0.5, 3]} rotation={[0, 0, Math.PI]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Edge glow */}
        <pointLight color={color} intensity={3} distance={4} decay={2} />
      </group>
    );
  } else if (data.obstacleType === 'left') {
    // Left obstacle: vertical wall on left side, forces head right
    return (
      <group ref={groupRef} position={[-2.5, 1.6, zPos]}>
        <mesh>
          <boxGeometry args={[0.5, 3.5, 0.3]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            roughness={0.3}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </mesh>
        {/* Arrow pointing RIGHT */}
        <mesh position={[0.4, 0, 0.16]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.3, 0.5, 3]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <pointLight color={color} intensity={3} distance={4} decay={2} />
      </group>
    );
  } else {
    // Right obstacle: vertical wall on right side, forces head left
    return (
      <group ref={groupRef} position={[2.5, 1.6, zPos]}>
        <mesh>
          <boxGeometry args={[0.5, 3.5, 0.3]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            roughness={0.3}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </mesh>
        {/* Arrow pointing LEFT */}
        <mesh position={[-0.4, 0, 0.16]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.3, 0.5, 3]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <pointLight color={color} intensity={3} distance={4} decay={2} />
      </group>
    );
  }
};

export default Obstacle;
