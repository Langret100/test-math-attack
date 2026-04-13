/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as THREE from 'three';

export enum GameStatus {
  LOADING = 'LOADING',
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export type HandType = 'left' | 'right';

export enum CutDirection {
  UP = 0,
  DOWN = 1,
  LEFT = 2,
  RIGHT = 3,
  ANY = 4
}

export type NoteType = 'normal' | 'number' | 'heart';
export type ObstacleType = 'top' | 'left' | 'right';

export interface NoteData {
  id: string;
  time: number;
  lineIndex: number; // 0-3
  lineLayer: number; // 0-2
  type: HandType;
  cutDirection: CutDirection;
  noteType: NoteType;
  numberValue?: number; // 1-100, only for 'number' type
  hit?: boolean;
  missed?: boolean;
  hitTime?: number;
}

export interface ObstacleData {
  id: string;
  time: number;
  obstacleType: ObstacleType;
  hit?: boolean;
}

export interface HandPositions {
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
  leftVelocity: THREE.Vector3;
  rightVelocity: THREE.Vector3;
}

export interface HeadPosition {
  x: number;
  y: number;
  detected: boolean;
}

export const COLORS = {
  left: '#ef4444',
  right: '#3b82f6',
  number: '#f59e0b',
  heart: '#ec4899',
  obstacle: '#ff4400',
  track: '#111111',
  hittable: '#ffffff'
};
