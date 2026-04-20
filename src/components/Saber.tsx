/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HandType, COLORS } from '../types';

interface SaberProps {
  type: HandType;
  positionRef: React.MutableRefObject<THREE.Vector3 | null>;
  velocityRef: React.MutableRefObject<THREE.Vector3 | null>;
}

const Saber: React.FC<SaberProps> = ({ type, positionRef, velocityRef }) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetRotation = useRef(new THREE.Euler());

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const targetPos = positionRef.current;
    const velocity = velocityRef.current;

    if (targetPos) {
      groupRef.current.visible = true;
      groupRef.current.position.lerp(targetPos, 0.55);

      const restingX = -Math.PI / 3.5;
      const restingZ = type === 'left' ? 0.2 : -0.2;
      let swayX = 0;
      let swayZ = 0;

      if (velocity) {
        swayX = velocity.y * 0.05 + velocity.z * 0.02;
        swayZ = -velocity.x * 0.05;
      }

      targetRotation.current.set(restingX + swayX, 0, restingZ + swayZ);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotation.current.x, 0.2);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation.current.y, 0.2);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetRotation.current.z, 0.2);
    } else {
      groupRef.current.visible = false;
    }
  });

  const color = type === 'left' ? COLORS.left : COLORS.right;
  const colorDark = type === 'left' ? '#7f1d1d' : '#1e3a5f';

  const BLADE_LENGTH = 1.1;
  const BLADE_RADIUS = 0.018;
  const GLOW_RADIUS = 0.042;
  const BLADE_START_Y = 0.055;

  return (
    <group ref={groupRef}>

      {/* HANDLE */}
      <mesh position={[0, -0.065, 0]}>
        <cylinderGeometry args={[0.022, 0.019, 0.13, 16]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.5} metalness={0.9} />
      </mesh>

      {/* Grip rings */}
      {([-0.09, -0.065, -0.04, -0.015] as number[]).map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.022, 0.003, 6, 24]} />
          <meshStandardMaterial color="#555" roughness={0.2} metalness={1} />
        </mesh>
      ))}

      {/* Color accent stripe */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.023, 0.023, 0.04, 16]} />
        <meshStandardMaterial color={colorDark} roughness={0.3} metalness={0.7} emissive={color} emissiveIntensity={0.3} />
      </mesh>

      {/* Pommel */}
      <mesh position={[0, -0.135, 0]}>
        <cylinderGeometry args={[0.027, 0.022, 0.015, 16]} />
        <meshStandardMaterial color="#888" roughness={0.2} metalness={1} />
      </mesh>
      <mesh position={[0, -0.145, 0]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshStandardMaterial color="#aaa" roughness={0.1} metalness={1} />
      </mesh>

      {/* GUARD */}
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[0.038, 0.024, 0.055, 16]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.15} metalness={1} />
      </mesh>
      <mesh position={[0, 0.034, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.022, 0.004, 8, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.042, 0]}>
        <cylinderGeometry args={[0.024, 0.032, 0.016, 16]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.1} metalness={1} />
      </mesh>

      {/* BLADE — cylinders only, NO capsule, so no bulging ends */}
      {/* Outer glow */}
      <mesh position={[0, BLADE_START_Y + BLADE_LENGTH / 2, 0]}>
        <cylinderGeometry args={[GLOW_RADIUS, GLOW_RADIUS * 0.55, BLADE_LENGTH, 16, 1, false]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.5} />
      </mesh>

      {/* Mid glow */}
      <mesh position={[0, BLADE_START_Y + BLADE_LENGTH / 2, 0]}>
        <cylinderGeometry args={[GLOW_RADIUS * 0.62, GLOW_RADIUS * 0.35, BLADE_LENGTH, 12, 1, false]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.65} />
      </mesh>

      {/* Bright core */}
      <mesh position={[0, BLADE_START_Y + BLADE_LENGTH / 2, 0]}>
        <cylinderGeometry args={[BLADE_RADIUS, BLADE_RADIUS * 0.45, BLADE_LENGTH, 10, 1, false]} />
        <meshBasicMaterial color="white" toneMapped={false} />
      </mesh>

      {/* Blade tip — cone cap (replaces capsule hemisphere) */}
      <mesh position={[0, BLADE_START_Y + BLADE_LENGTH + GLOW_RADIUS * 1.3, 0]}>
        <coneGeometry args={[GLOW_RADIUS * 0.55, GLOW_RADIUS * 3.5, 12, 1, false]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, BLADE_START_Y + BLADE_LENGTH + BLADE_RADIUS * 1.5, 0]}>
        <coneGeometry args={[BLADE_RADIUS * 0.7, BLADE_RADIUS * 5, 8, 1, false]} />
        <meshBasicMaterial color="white" toneMapped={false} />
      </mesh>

      {/* Point light */}
      <pointLight
        color={color}
        intensity={3}
        distance={2.5}
        decay={2}
        position={[0, BLADE_START_Y + BLADE_LENGTH * 0.5, 0]}
      />
    </group>
  );
};

export default Saber;
