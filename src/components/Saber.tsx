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
  wristDirRef?: React.MutableRefObject<THREE.Vector3 | null>;
}

const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _currentQuat = new THREE.Quaternion();

const Saber: React.FC<SaberProps> = ({ type, positionRef, velocityRef, wristDirRef }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const pos = positionRef.current;
    const vel = velocityRef.current;
    const wristDir = wristDirRef?.current;

    if (!pos) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    // Position: very snappy lerp
    groupRef.current.position.lerp(pos, 0.85);

    // Rotation: align blade with wrist direction + velocity lean
    let bladeDir = new THREE.Vector3(0, 1, 0); // default: straight up

    if (wristDir && wristDir.lengthSq() > 0.01) {
      bladeDir.copy(wristDir);
    }

    // Add velocity lean — swing motion tilts blade forward/back, left/right
    if (vel && vel.lengthSq() > 0.01) {
      const speed = vel.length();
      const velN = vel.clone().normalize();
      // Lean blade in direction of motion (max 50 degrees lean)
      const leanStrength = Math.min(speed * 0.04, 0.8);
      bladeDir.addScaledVector(velN, leanStrength).normalize();
    }

    // Convert direction vector → quaternion rotation
    // blade points along local Y — we need to rotate Y-axis to bladeDir
    // Use tilt: project bladeDir to XY plane only (no Z depth distortion)
    const angle = Math.atan2(bladeDir.x, bladeDir.y);
    _targetQuat.setFromAxisAngle(new THREE.Vector3(0, 0, type === 'left' ? -1 : 1), angle * 0.0);

    // Actually: use full rotation from Y-up to bladeDir
    _quat.setFromUnitVectors(_up, bladeDir.clone().normalize());
    _targetQuat.copy(_quat);

    // Also tilt forward based on velocity Z
    if (vel) {
      const forwardTilt = THREE.MathUtils.clamp(-vel.y * 0.06, -0.6, 0.6);
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), forwardTilt
      );
      _targetQuat.multiply(tiltQ);
    }

    // Resting lean — left saber tilts slightly left, right tilts right
    const restLean = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1), type === 'left' ? 0.15 : -0.15
    );
    _targetQuat.multiply(restLean);

    // Snappy slerp — fast enough to feel responsive
    groupRef.current.quaternion.slerp(_targetQuat, 0.55);
  });

  const color = type === 'left' ? COLORS.left : COLORS.right;
  const colorDark = type === 'left' ? '#7f1d1d' : '#1e3a5f';

  const BL = 1.1;   // blade length
  const BR = 0.018; // blade core radius
  const GR = 0.042; // glow radius
  const BS = 0.055; // blade start Y

  return (
    <group ref={groupRef}>
      {/* HANDLE */}
      <mesh position={[0, -0.065, 0]}>
        <cylinderGeometry args={[0.022, 0.019, 0.13, 16]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.5} metalness={0.9} />
      </mesh>
      {([-0.09, -0.065, -0.04, -0.015] as number[]).map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.022, 0.003, 6, 24]} />
          <meshStandardMaterial color="#555" roughness={0.2} metalness={1} />
        </mesh>
      ))}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.023, 0.023, 0.04, 16]} />
        <meshStandardMaterial color={colorDark} roughness={0.3} metalness={0.7} emissive={color} emissiveIntensity={0.3} />
      </mesh>
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

      {/* BLADE — cylinders only, tapers toward tip */}
      <mesh position={[0, BS + BL / 2, 0]}>
        <cylinderGeometry args={[GR, GR * 0.45, BL, 16, 1, false]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, BS + BL / 2, 0]}>
        <cylinderGeometry args={[GR * 0.6, GR * 0.28, BL, 12, 1, false]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.65} />
      </mesh>
      <mesh position={[0, BS + BL / 2, 0]}>
        <cylinderGeometry args={[BR, BR * 0.4, BL, 10, 1, false]} />
        <meshBasicMaterial color="white" toneMapped={false} />
      </mesh>

      {/* Tip cone — clean pointed end, no capsule bulge */}
      <mesh position={[0, BS + BL + GR * 1.1, 0]}>
        <coneGeometry args={[GR * 0.5, GR * 3.2, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.4} />
      </mesh>
      <mesh position={[0, BS + BL + BR * 1.2, 0]}>
        <coneGeometry args={[BR * 0.6, BR * 4.5, 8]} />
        <meshBasicMaterial color="white" toneMapped={false} />
      </mesh>

      <pointLight color={color} intensity={3} distance={2.5} decay={2}
        position={[0, BS + BL * 0.5, 0]} />
    </group>
  );
};

export default Saber;
