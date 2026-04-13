/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { CutDirection, NoteData, ObstacleData } from "./types";
import * as THREE from 'three';

// Game World Config
export const TRACK_LENGTH = 50;
export const SPAWN_Z = -30;
export const PLAYER_Z = 0;
export const MISS_Z = 5;
export const NOTE_SPEED = 10;

export const LANE_WIDTH = 0.8;
export const LAYER_HEIGHT = 0.8;
export const NOTE_SIZE = 0.5;

// 4 lanes x 3 layers
export const LANE_X_POSITIONS = [-1.5 * LANE_WIDTH, -0.5 * LANE_WIDTH, 0.5 * LANE_WIDTH, 1.5 * LANE_WIDTH];
export const LAYER_Y_POSITIONS = [0.8, 1.6, 2.4]; // Low, Mid, High

// Audio
export const SONG_URL = 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/race2.ogg';
export const SONG_BPM = 140;
const BEAT_TIME = 60 / SONG_BPM;

// Possible multiplier targets shown to player
export const MULTIPLIER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Generates a 1-100 number that is a multiple of the given factor
export const getMultipleOf = (factor: number): number => {
  const multiples: number[] = [];
  for (let i = factor; i <= 100; i += factor) multiples.push(i);
  return multiples[Math.floor(Math.random() * multiples.length)];
};

// Generates a 1-100 number that is NOT a multiple of the given factor
export const getNonMultipleOf = (factor: number): number => {
  const nonMultiples: number[] = [];
  for (let i = 1; i <= 100; i++) {
    if (i % factor !== 0) nonMultiples.push(i);
  }
  return nonMultiples[Math.floor(Math.random() * nonMultiples.length)];
};

// Chart generator
export const generateDemoChart = (): { notes: NoteData[], obstacles: ObstacleData[] } => {
  const notes: NoteData[] = [];
  const obstacles: ObstacleData[] = [];
  let idCount = 0;
  let obsCount = 0;

  const rand = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
  const allLayers = [0, 1, 2];
  const allLanes = [0, 1, 2, 3];
  const leftLanes = [0, 1];
  const rightLanes = [2, 3];

  for (let i = 4; i < 220; i += 2) {
    const time = i * BEAT_TIME;
    const section = Math.floor(i / 8) % 6;

    // --- Normal notes scattered across all lanes/layers ---
    if (section === 0) {
      // Alternating single hits
      if (i % 4 === 0) {
        notes.push({ id: `n-${idCount++}`, time, lineIndex: rand(leftLanes), lineLayer: rand(allLayers), type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' });
      } else {
        notes.push({ id: `n-${idCount++}`, time, lineIndex: rand(rightLanes), lineLayer: rand(allLayers), type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' });
      }
    } else if (section === 1) {
      // Double hits spread wide
      if (i % 8 === 0) {
        notes.push(
          { id: `n-${idCount++}`, time, lineIndex: 0, lineLayer: rand(allLayers), type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' },
          { id: `n-${idCount++}`, time, lineIndex: 3, lineLayer: rand(allLayers), type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' }
        );
      } else if (i % 4 === 0) {
        notes.push(
          { id: `n-${idCount++}`, time, lineIndex: 1, lineLayer: 2, type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' },
          { id: `n-${idCount++}`, time, lineIndex: 2, lineLayer: 2, type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' }
        );
      }
    } else if (section === 2) {
      // Stream pattern with varied height
      notes.push({ id: `n-${idCount++}`, time, lineIndex: rand([0,1]), lineLayer: rand(allLayers), type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' });
      notes.push({ id: `n-${idCount++}`, time: time + BEAT_TIME * 0.5, lineIndex: rand([2,3]), lineLayer: rand(allLayers), type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' });
    } else if (section === 3) {
      // High-low contrast
      if (i % 4 === 0) {
        notes.push({ id: `n-${idCount++}`, time, lineIndex: rand(leftLanes), lineLayer: 2, type: 'left', cutDirection: CutDirection.UP, noteType: 'normal' });
        notes.push({ id: `n-${idCount++}`, time, lineIndex: rand(rightLanes), lineLayer: 0, type: 'right', cutDirection: CutDirection.DOWN, noteType: 'normal' });
      }
    } else if (section === 4) {
      // Quad hit
      if (i % 16 === 0) {
        notes.push(
          { id: `n-${idCount++}`, time, lineIndex: 0, lineLayer: 0, type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' },
          { id: `n-${idCount++}`, time, lineIndex: 1, lineLayer: 2, type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' },
          { id: `n-${idCount++}`, time, lineIndex: 2, lineLayer: 0, type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' },
          { id: `n-${idCount++}`, time, lineIndex: 3, lineLayer: 2, type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' }
        );
      } else {
        notes.push({ id: `n-${idCount++}`, time, lineIndex: rand(allLanes), lineLayer: rand(allLayers), type: rand(['left','right']) as HandType, cutDirection: CutDirection.ANY, noteType: 'normal' });
      }
    } else {
      // Section 5: Cross pattern
      if (i % 4 === 0) {
        notes.push({ id: `n-${idCount++}`, time, lineIndex: 2, lineLayer: rand(allLayers), type: 'left', cutDirection: CutDirection.ANY, noteType: 'normal' });
      } else {
        notes.push({ id: `n-${idCount++}`, time, lineIndex: 1, lineLayer: rand(allLayers), type: 'right', cutDirection: CutDirection.ANY, noteType: 'normal' });
      }
    }

    // --- Number notes (every ~12 beats) ---
    if (i % 24 === 12) {
      const count = Math.floor(Math.random() * 2) + 2; // 2-3 number notes in a row
      for (let k = 0; k < count; k++) {
        notes.push({
          id: `num-${idCount++}`,
          time: time + k * BEAT_TIME * 2,
          lineIndex: rand(allLanes),
          lineLayer: rand(allLayers),
          type: rand(['left', 'right']) as HandType,
          cutDirection: CutDirection.ANY,
          noteType: 'number',
          numberValue: Math.floor(Math.random() * 100) + 1 // placeholder, will be replaced at runtime
        });
      }
    }

    // --- Heart notes (rare, every ~32 beats) ---
    if (i % 64 === 32) {
      notes.push({
        id: `heart-${idCount++}`,
        time: time,
        lineIndex: rand([1, 2]),
        lineLayer: 1,
        type: rand(['left', 'right']) as HandType,
        cutDirection: CutDirection.ANY,
        noteType: 'heart'
      });
    }
  }

  // --- Obstacles (head dodge) ---
  // Obstacles appear every ~16 beats, alternating types
  const obstacleTypes: ('top' | 'left' | 'right')[] = ['top', 'left', 'right'];
  for (let i = 32; i < 220; i += 16) {
    const time = i * BEAT_TIME;
    const ot = obstacleTypes[Math.floor(i / 16) % obstacleTypes.length];
    obstacles.push({ id: `obs-${obsCount++}`, time, obstacleType: ot });
  }

  return {
    notes: notes.sort((a, b) => a.time - b.time),
    obstacles: obstacles.sort((a, b) => a.time - b.time)
  };
};

export const DEMO_DATA = generateDemoChart();
export const DEMO_CHART = DEMO_DATA.notes;
export const DEMO_OBSTACLES = DEMO_DATA.obstacles;

export const DIRECTION_VECTORS: Record<CutDirection, THREE.Vector3> = {
  [CutDirection.UP]: new THREE.Vector3(0, 1, 0),
  [CutDirection.DOWN]: new THREE.Vector3(0, -1, 0),
  [CutDirection.LEFT]: new THREE.Vector3(-1, 0, 0),
  [CutDirection.RIGHT]: new THREE.Vector3(1, 0, 0),
  [CutDirection.ANY]: new THREE.Vector3(0, 0, 0)
};
