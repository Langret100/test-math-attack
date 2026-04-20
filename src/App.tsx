/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import { GameStatus, NoteData } from './types';
import { DEMO_CHART, DEMO_OBSTACLES, SONG_URL, MULTIPLIER_OPTIONS } from './constants';
import { useMediaPipe } from './hooks/useMediaPipe';
import GameScene from './components/GameScene';
import WebcamPreview from './components/WebcamPreview';
import { Play, RefreshCw, VideoOff, Hand, Sparkles, Heart } from 'lucide-react';

const MAX_HEARTS = 3;

// Heart display component
const Hearts: React.FC<{ count: number }> = ({ count }) => (
  <div className="flex gap-2">
    {Array.from({ length: MAX_HEARTS }).map((_, i) => (
      <div key={i} className={`transition-all duration-300 ${i < count ? 'scale-110' : 'scale-90 opacity-30'}`}>
        <Heart
          className={`w-8 h-8 ${i < count ? 'text-pink-500 fill-pink-500' : 'text-gray-600 fill-gray-700'}`}
          style={i < count ? { filter: 'drop-shadow(0 0 8px #ec4899)' } : {}}
        />
      </div>
    ))}
  </div>
);

// Obstacle warning indicator 
const ObstacleWarning: React.FC<{ type: 'top' | 'left' | 'right' | null }> = ({ type }) => {
  if (!type) return null;
  const messages: Record<string, { text: string; icon: string; pos: string }> = {
    top: { text: '머리 숙여!', icon: '⬇️', pos: 'top-24 left-1/2 -translate-x-1/2' },
    left: { text: '오른쪽으로!', icon: '➡️', pos: 'top-1/2 left-8 -translate-y-1/2' },
    right: { text: '왼쪽으로!', icon: '⬅️', pos: 'top-1/2 right-8 -translate-y-1/2' },
  };
  const m = messages[type];
  return (
    <div className={`absolute ${m.pos} z-20 pointer-events-none`}>
      <div className="bg-orange-500/80 text-white text-2xl font-black px-6 py-3 rounded-2xl border-4 border-orange-300 animate-pulse backdrop-blur-sm shadow-[0_0_30px_rgba(255,100,0,0.8)]">
        {m.icon} {m.text}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.LOADING);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [numberMultiplier, setNumberMultiplier] = useState(5);
  const [nextMultiplier, setNextMultiplier] = useState(5);
  const [obstacleWarning, setObstacleWarning] = useState<'top' | 'left' | 'right' | null>(null);
  const [showDamageFlash, setShowDamageFlash] = useState(false);
  const [lastHitMessage, setLastHitMessage] = useState<{ text: string; color: string } | null>(null);
  const [gameKey, setGameKey] = useState(0); // bump to remount GameScene cleanly

  const audioRef = useRef<HTMLAudioElement>(new Audio(SONG_URL));
  const videoRef = useRef<HTMLVideoElement>(null);

  const { isCameraReady, handPositionsRef, headPositionRef, lastResultsRef, error: cameraError } = useMediaPipe(videoRef);
  const { progress } = useProgress();

  const showMessage = useCallback((text: string, color: string) => {
    setLastHitMessage({ text, color });
    setTimeout(() => setLastHitMessage(null), 800);
  }, []);

  const handleDamage = useCallback(() => {
    setHearts(h => {
      const newH = h - 1;
      if (newH <= 0) {
        setTimeout(() => endGame(false), 100);
        return 0;
      }
      return newH;
    });
    setShowDamageFlash(true);
    setTimeout(() => setShowDamageFlash(false), 300);
  }, []);

  const handleNoteHit = useCallback((note: NoteData, goodCut: boolean) => {
    if (navigator.vibrate) navigator.vibrate(goodCut ? 40 : 20);

    if (note.noteType === 'heart') {
      // Heart note: restore one heart
      setHearts(h => Math.min(MAX_HEARTS, h + 1));
      showMessage('💖 +1 라이프!', '#ec4899');
      setScore(s => s + 200);
      setCombo(c => c + 1);
      return;
    }

    if (note.noteType === 'number') {
      // Check if it's a correct multiple
      const isCorrect = note.numberValue !== undefined && note.numberValue % numberMultiplier === 0;
      if (isCorrect) {
        const pts = 300 * (combo > 10 ? 2 : 1);
        setScore(s => s + pts);
        setCombo(c => c + 1);
        showMessage(`✓ ${note.numberValue} = ${numberMultiplier}의 배수! +${pts}`, '#f59e0b');
      } else {
        // Wrong number hit = penalty (same as miss)
        setCombo(0);
        showMessage(`✗ ${note.numberValue}은 ${numberMultiplier}의 배수가 아님!`, '#ef4444');
        handleDamage();
      }
      return;
    }

    // Normal note
    // goodCut = correct color AND sufficient speed; !goodCut = wrong color or slow
    if (!goodCut) {
      setCombo(0);
      showMessage(`✗ 색이 다른 손으로 쳤어요!`, '#ef4444');
      handleDamage();
      return;
    }
    const points = 150;
    const multiplier = combo > 20 ? 4 : combo > 10 ? 2 : 1;
    setCombo(c => c + 1);
    setScore(s => s + points * multiplier);
    showMessage(`GREAT! +${points * multiplier}`, '#3b82f6');
  }, [numberMultiplier, combo, showMessage, handleDamage]);

  const handleNoteMiss = useCallback((note: NoteData) => {
    setCombo(0);
    if (note.noteType === 'number') {
      // Missing a correct number (it was a valid multiple) = penalty
      const isCorrect = note.numberValue !== undefined && note.numberValue % numberMultiplier === 0;
      if (isCorrect) handleDamage();
    } else {
      handleDamage();
    }
  }, [numberMultiplier, handleDamage]);

  const handleObstacleHit = useCallback(() => {
    setCombo(0);
    showMessage('💥 장애물 충돌!', '#ff6600');
    handleDamage();
  }, [handleDamage, showMessage]);

  // Pre-warn about incoming obstacles
  const handleObstacleWarning = useCallback((type: 'top' | 'left' | 'right' | null) => {
    setObstacleWarning(type);
  }, []);

  const handleMultiplierChange = useCallback((newMult: number) => {
    setNumberMultiplier(newMult);
  }, []);

  const startGame = async () => {
    if (!isCameraReady) return;

    setScore(0);
    setCombo(0);
    setHearts(MAX_HEARTS);
    const startMult = MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)];
    setNumberMultiplier(startMult);
    setGameKey(k => k + 1); // remount GameScene to reset all refs cleanly

    DEMO_CHART.forEach(n => { n.hit = false; n.missed = false; });
    DEMO_OBSTACLES.forEach(o => { o.hit = false; });

    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        setGameStatus(GameStatus.PLAYING);
      }
    } catch (e) {
      console.error("Audio play failed", e);
      alert("Could not start audio. Please interact with the page first.");
    }
  };

  const endGame = (victory: boolean) => {
    setGameStatus(victory ? GameStatus.VICTORY : GameStatus.GAME_OVER);
    if (audioRef.current) audioRef.current.pause();
  };

  useEffect(() => {
    if (gameStatus === GameStatus.LOADING && isCameraReady) {
      setGameStatus(GameStatus.IDLE);
    }
  }, [isCameraReady, gameStatus]);

  // Obstacle warning system: watch obstacles and show warning 2s ahead
  useEffect(() => {
    if (gameStatus !== GameStatus.PLAYING) return;
    let warnTimeout: ReturnType<typeof setTimeout>;
    let clearTimeout_: ReturnType<typeof setTimeout>;

    const checkObstacles = () => {
      if (!audioRef.current) return;
      const time = audioRef.current.currentTime;
      const upcoming = DEMO_OBSTACLES.find(o => !o.hit && o.time - time > 0 && o.time - time < 2.5);
      if (upcoming) {
        setObstacleWarning(upcoming.obstacleType);
      } else {
        setObstacleWarning(null);
      }
    };

    const interval = setInterval(checkObstacles, 100);
    return () => clearInterval(interval);
  }, [gameStatus]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      {/* Hidden Video */}
      <video
        ref={videoRef}
        className="absolute opacity-0 pointer-events-none"
        playsInline muted autoPlay
        style={{ width: '640px', height: '480px' }}
      />

      {/* Damage Flash Overlay */}
      {showDamageFlash && (
        <div className="absolute inset-0 bg-red-600/40 z-50 pointer-events-none animate-ping" style={{ animationDuration: '0.3s', animationIterationCount: 1 }} />
      )}

      {/* 3D Canvas */}
      <Canvas shadows dpr={[1, 2]}>
        {gameStatus !== GameStatus.LOADING && (
          <GameScene
            key={gameKey}
            gameStatus={gameStatus}
            audioRef={audioRef}
            handPositionsRef={handPositionsRef}
            headPositionRef={headPositionRef}
            chart={DEMO_CHART}
            obstacles={DEMO_OBSTACLES}
            currentMultiplier={numberMultiplier}
            onNoteHit={handleNoteHit}
            onNoteMiss={handleNoteMiss}
            onObstacleHit={handleObstacleHit}
            onSongEnd={() => endGame(true)}
            onMultiplierChange={handleMultiplierChange}
          />
        )}
      </Canvas>

      {/* Webcam Preview */}
      <WebcamPreview videoRef={videoRef} resultsRef={lastResultsRef} isCameraReady={isCameraReady} />

      {/* Obstacle Warning */}
      <ObstacleWarning type={obstacleWarning} />

      {/* HIT MESSAGE */}
      {lastHitMessage && (
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-2xl font-black tracking-wider animate-bounce"
          style={{ color: lastHitMessage.color, textShadow: `0 0 20px ${lastHitMessage.color}` }}
        >
          {lastHitMessage.text}
        </div>
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">

        {/* HUD Top */}
        <div className="flex justify-between items-start text-white w-full">

          {/* Left: Hearts */}
          <div className="flex flex-col gap-2">
            <Hearts count={hearts} />
            {gameStatus === GameStatus.PLAYING && (
              <div className="text-xs text-gray-400 mt-1">라이프</div>
            )}
          </div>

          {/* Center: Score & Combo */}
          <div className="text-center">
            <h1 className="text-5xl font-bold tracking-wider drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">
              {score.toLocaleString()}
            </h1>
            <div className="mt-2 flex flex-col items-center">
              <p className={`text-2xl font-bold ${combo > 10 ? 'text-blue-400' : 'text-gray-300'} transition-all`}>
                {combo}x COMBO
              </p>
              {/* Number Multiplier Display */}
              {gameStatus === GameStatus.PLAYING && (
                <div className="mt-2 bg-amber-900/70 border-2 border-amber-400 rounded-xl px-4 py-2 backdrop-blur-sm">
                  <p className="text-amber-300 text-xs font-bold uppercase tracking-widest mb-1">지금 때릴 숫자</p>
                  <p className="text-amber-100 text-xl font-black">
                    <span className="text-amber-400 text-3xl">{numberMultiplier}</span>의 배수
                  </p>
                  <p className="text-amber-400/70 text-xs mt-1">예: {numberMultiplier * 2}, {numberMultiplier * 3}, {numberMultiplier * 5}...</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: head tracking indicator */}
          <div className="flex flex-col items-end gap-2">
            {gameStatus === GameStatus.PLAYING && (
              <div className="text-xs text-gray-400 bg-black/50 px-3 py-2 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${headPositionRef?.current?.detected ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span>머리 추적</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Menus (Centered) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">

          {gameStatus === GameStatus.LOADING && (
            <div className="bg-black/80 p-10 rounded-2xl flex flex-col items-center border border-blue-900/50 backdrop-blur-md">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
              <h2 className="text-2xl text-white font-bold mb-2">MathAttack 초기화 중</h2>
              <p className="text-blue-300">{!isCameraReady ? "카메라 대기 중..." : "에셋 로딩 중..."}</p>
              {cameraError && <p className="text-red-500 mt-4 max-w-xs text-center">{cameraError}</p>}
            </div>
          )}

          {gameStatus === GameStatus.IDLE && (
            <div className="bg-black/85 p-10 rounded-3xl text-center border-2 border-blue-500/30 backdrop-blur-xl max-w-xl">
              <div className="mb-4 flex justify-center">
                <Sparkles className="w-14 h-14 text-blue-400" />
              </div>
              <h1 className="text-6xl font-black text-white mb-4 tracking-tighter italic drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]">
                MATH <span className="text-blue-500">ATTACK</span></h1>
                      <p className="text-amber-400 text-lg font-bold tracking-widest mb-2">메스어택 &mdash; 수학 공격</p>

              <div className="space-y-3 text-gray-300 mb-6 text-sm">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-left space-y-2">
                  <p className="flex items-center gap-2"><Hand className="w-4 h-4 text-blue-400 flex-shrink-0" /><span><span className="text-red-400 font-bold">빨강</span> 노트 = 왼손 | <span className="text-blue-400 font-bold">파랑</span> 노트 = 오른손</span></p>
                  <p className="flex items-center gap-2"><span className="text-amber-400">🔢</span><span><span className="text-amber-400 font-bold">숫자 노트</span>: 화면의 배수에 맞는 숫자만 때리기</span></p>
                  <p className="flex items-center gap-2"><span className="text-pink-400">💖</span><span><span className="text-pink-400 font-bold">하트 노트</span>: 때리면 라이프 회복</span></p>
                  <p className="flex items-center gap-2"><span className="text-orange-500">⚠️</span><span><span className="text-orange-400 font-bold">장애물</span>: 머리로 위/좌/우 회피! (경고 보면 피하기)</span></p>
                </div>
                <p className="text-gray-500 text-xs">엉뚱한 숫자 or 장애물 충돌 = ❤️ -1 | 하트 3개 소진 = 게임 오버</p>
              </div>

              {!isCameraReady ? (
                <div className="flex items-center justify-center text-red-400 gap-2 bg-red-900/20 p-4 rounded-lg">
                  <VideoOff /> 카메라를 준비 중입니다...
                </div>
              ) : (
                <button
                  onClick={startGame}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold py-4 px-12 rounded-full transition-all transform hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] flex items-center justify-center mx-auto gap-3"
                >
                  <Play fill="currentColor" /> 게임 시작
                </button>
              )}
            </div>
          )}

          {(gameStatus === GameStatus.GAME_OVER || gameStatus === GameStatus.VICTORY) && (
            <div className="bg-black/90 p-12 rounded-3xl text-center border-2 border-white/10 backdrop-blur-xl">
              <h2 className={`text-6xl font-bold mb-4 ${gameStatus === GameStatus.VICTORY ? 'text-green-400' : 'text-red-500'}`}>
                {gameStatus === GameStatus.VICTORY ? '🎉 클리어!' : '💀 게임 오버'}
              </h2>
              <p className="text-white text-3xl mb-2">최종 점수</p>
              <p className="text-5xl font-black text-blue-400 mb-8">{score.toLocaleString()}</p>
              <button
                onClick={() => setGameStatus(GameStatus.IDLE)}
                className="bg-white/10 hover:bg-white/20 text-white text-xl py-3 px-8 rounded-full flex items-center justify-center mx-auto gap-2 transition-colors"
              >
                <RefreshCw /> 다시 플레이
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
