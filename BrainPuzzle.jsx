import React, { useState, useEffect, useRef, useCallback } from "react";

/**
 * Brain Puzzle — jeu de casse-tête façon "Brain Test" pour iPhone.
 * Chaque niveau piège le joueur avec une consigne trompeuse : la solution
 * n'est presque jamais celle que l'énoncé suggère au premier regard.
 *
 * Drop-in: <BrainPuzzle /> dans une app React Native (Expo) ou React web
 * (les interactions utilisent onClick/onPointerDown, compatibles web ;
 * pour React Native, remplacer les <div>/<button> par <View>/<Pressable>).
 */

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const STORAGE_KEY = "brainpuzzle_progress_v1";

function loadProgress() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { unlocked: 1, stars: {}, hints: 3 };
    return JSON.parse(raw);
  } catch {
    return { unlocked: 1, stars: {}, hints: 3 };
  }
}

function saveProgress(progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* stockage indisponible, on continue sans persister */
  }
}

function useConfetti() {
  const [pieces, setPieces] = useState([]);
  const burst = useCallback(() => {
    const colors = ["#FF5D5D", "#FFC93C", "#4CD787", "#4FA8FF", "#B57BFF"];
    const next = Array.from({ length: 40 }).map((_, i) => ({
      id: `${Date.now()}-${i}`,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.3,
      rotate: Math.random() * 360,
      duration: 1.4 + Math.random() * 0.8,
    }));
    setPieces(next);
    setTimeout(() => setPieces([]), 2400);
  }, []);
  return { pieces, burst };
}

// ---------------------------------------------------------------------------
// Définition des niveaux
// Chaque niveau expose: id, title, instruction, render(state helpers), check()
// ---------------------------------------------------------------------------

const LEVELS = [
  {
    id: 1,
    title: "Le bouton têtu",
    instruction: "Appuie sur le bouton START pour lancer la fusée.",
    hint: "Le bouton START ne réagit pas... regarde s'il y a un autre moyen d'appuyer dessus.",
    Component: ({ onSolved }) => {
      const [moved, setMoved] = useState(false);
      const [solved, setSolved] = useState(false);
      return (
        <div className="stage">
          <p className="flavor">La fusée refuse de décoller...</p>
          <div className="rocket">🚀</div>
          <button
            className={`btn primary ${moved ? "dodge" : ""}`}
            onMouseEnter={() => setMoved(true)}
            onClick={() => {
              // Le vrai déclencheur : double-clic après le "dodge"
              if (moved) {
                setSolved(true);
                onSolved();
              }
            }}
          >
            START
          </button>
          <p className="tip">{solved ? "Décollage réussi !" : ""}</p>
        </div>
      );
    },
  },
  {
    id: 2,
    title: "Compte les moutons",
    instruction: "Combien de moutons vois-tu à l'écran ? Appuie sur le bon chiffre.",
    hint: "Regarde bien... un des moutons est en fait un loup déguisé, et il y a un mouton caché derrière le nuage.",
    Component: ({ onSolved }) => {
      const answer = 4; // 5 affichés, 1 est un loup -> 4 vrais moutons
      return (
        <div className="stage">
          <p className="flavor">🐑 🐺 🐑 ☁️🐑(caché) 🐑</p>
          <div className="grid4">
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                className="btn choice"
                onClick={() => n === answer && onSolved()}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 3,
    title: "Aide le fermier à traverser",
    instruction: "Fais traverser la rivière au loup, à la chèvre et au chou sans perte.",
    hint: "Relis l'instruction : on ne t'a jamais demandé de respecter les règles classiques du problème, juste de tout faire traverser.",
    Component: ({ onSolved }) => {
      const [side, setSide] = useState({ loup: "A", chevre: "A", chou: "A" });
      const allCrossed = Object.values(side).every((s) => s === "B");
      return (
        <div className="stage">
          <p className="flavor">🌊 Rivière — touche chaque animal pour le faire traverser</p>
          <div className="river">
            {Object.entries(side).map(([k, v]) => (
              <button
                key={k}
                className={`animal ${v === "B" ? "crossed" : ""}`}
                onClick={() =>
                  setSide((s) => {
                    const ns = { ...s, [k]: s[k] === "A" ? "B" : "A" };
                    if (Object.values(ns).every((x) => x === "B")) {
                      setTimeout(onSolved, 200);
                    }
                    return ns;
                  })
                }
              >
                {k === "loup" ? "🐺" : k === "chevre" ? "🐐" : "🥬"}
              </button>
            ))}
          </div>
          <p className="tip">{allCrossed ? "Tout le monde est passé !" : ""}</p>
        </div>
      );
    },
  },
  {
    id: 4,
    title: "Réveille le chat",
    instruction: "Le chat dort profondément. Trouve un moyen de le réveiller.",
    hint: "Crier ne marche pas sur un écran tactile... et si tu secouais le téléphone, ou mieux, chatouillais le chat directement ?",
    Component: ({ onSolved }) => {
      const [taps, setTaps] = useState(0);
      return (
        <div className="stage">
          <p className="flavor">😴 Zzz...</p>
          <div
            className="cat"
            onClick={() => {
              const t = taps + 1;
              setTaps(t);
              if (t >= 5) onSolved(); // il faut le chatouiller 5 fois
            }}
          >
            🐱
          </div>
          <p className="tip">Chatouilles : {taps}/5</p>
        </div>
      );
    },
  },
  {
    id: 5,
    title: "La balance truquée",
    instruction: "Mets les poids sur la balance pour qu'elle soit parfaitement équilibrée.",
    hint: "Aucune combinaison de poids ne s'équilibre... enlève carrément tous les poids, une balance vide est équilibrée !",
    Component: ({ onSolved }) => {
      const [weights, setWeights] = useState([2, 3, 5]);
      const [left, setLeft] = useState([]);
      const [right, setRight] = useState([]);
      const balanced =
        weights.length === 0 &&
        left.length === 0 &&
        right.length === 0;
      return (
        <div className="stage">
          <p className="flavor">⚖️ Balance</p>
          <div className="weights">
            {weights.map((w, i) => (
              <button
                key={i}
                className="btn choice small"
                onClick={() => setWeights((ws) => ws.filter((_, j) => j !== i))}
              >
                {w}kg 🗑️
              </button>
            ))}
          </div>
          <button
            className="btn primary"
            onClick={() => weights.length === 0 && onSolved()}
          >
            Vérifier l'équilibre
          </button>
          <p className="tip">{balanced ? "Équilibre parfait !" : "Retire tous les poids..."}</p>
        </div>
      );
    },
  },
  {
    id: 6,
    title: "L'horloge cassée",
    instruction: "Règle l'horloge pour qu'il soit exactement midi.",
    hint: "Les aiguilles bougent dans le mauvais sens ! Essaie de faire tourner l'horloge elle-même plutôt que les aiguilles.",
    Component: ({ onSolved }) => {
      const [rotation, setRotation] = useState(0);
      const normalized = ((rotation % 360) + 360) % 360;
      const isNoon = normalized < 15 || normalized > 345;
      return (
        <div className="stage">
          <p className="flavor">🕰️ Fais pivoter l'horloge entière</p>
          <div
            className="clock"
            style={{ transform: `rotate(${rotation}deg)` }}
            onClick={() => setRotation((r) => r + 30)}
          >
            🕛
          </div>
          <button
            className="btn primary"
            onClick={() => isNoon && onSolved()}
          >
            Valider midi
          </button>
        </div>
      );
    },
  },
  {
    id: 7,
    title: "Le coffre-fort",
    instruction: "Trouve le code à 3 chiffres du coffre grâce aux indices dans la pièce.",
    hint: "Additionne le nombre de fenêtres (2), de tableaux (1) et de plantes (4) dans la pièce : 214.",
    Component: ({ onSolved }) => {
      const [code, setCode] = useState("");
      return (
        <div className="stage">
          <p className="flavor">🪟🪟 🖼️ 🪴🪴🪴🪴</p>
          <input
            className="code-input"
            maxLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="---"
          />
          <button
            className="btn primary"
            onClick={() => code === "214" && onSolved()}
          >
            Déverrouiller
          </button>
        </div>
      );
    },
  },
  {
    id: 8,
    title: "Trop de bulles",
    instruction: "Fais éclater toutes les bulles avant qu'elles n'atteignent le haut de l'écran.",
    hint: "Il y a une bulle piégée tout en bas, hors de vue au premier abord : fais défiler ou cherche-la dans le coin.",
    Component: ({ onSolved }) => {
      const initial = Array.from({ length: 9 }).map((_, i) => i);
      const [bubbles, setBubbles] = useState(initial);
      useEffect(() => {
        if (bubbles.length === 0) onSolved();
      }, [bubbles, onSolved]);
      return (
        <div className="stage">
          <p className="flavor">🫧 Pop pop pop !</p>
          <div className="bubbleField">
            {bubbles.map((b) => (
              <button
                key={b}
                className="bubble"
                style={{
                  left: `${(b * 37) % 90}%`,
                  top: `${(b * 53) % 80}%`,
                }}
                onClick={() => setBubbles((bs) => bs.filter((x) => x !== b))}
              >
                🫧
              </button>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 9,
    title: "Le miroir menteur",
    instruction: "Touche l'objet réel, pas son reflet dans le miroir.",
    hint: "Tout ce qui est affiché EST un reflet ! Touche en dehors du cadre du miroir, sur le vrai objet à côté.",
    Component: ({ onSolved }) => {
      return (
        <div className="stage">
          <p className="flavor">🪞 Miroir</p>
          <div className="mirrorFrame">
            <div className="mirrorReflection">🍎</div>
          </div>
          <button className="realApple" onClick={onSolved}>
            🍏 (le vrai, à l'extérieur du cadre)
          </button>
        </div>
      );
    },
  },
  {
    id: 10,
    title: "Le dernier niveau",
    instruction: "Appuie 100 fois sur le bouton pour gagner le jeu.",
    hint: "Personne n'a le temps de taper 100 fois... maintiens le bouton enfoncé quelques secondes à la place.",
    Component: ({ onSolved }) => {
      const [holding, setHolding] = useState(false);
      const timerRef = useRef(null);
      const start = () => {
        setHolding(true);
        timerRef.current = setTimeout(() => {
          onSolved();
        }, 1500);
      };
      const stop = () => {
        setHolding(false);
        clearTimeout(timerRef.current);
      };
      return (
        <div className="stage">
          <p className="flavor">🏆 Bravo d'être arrivé jusqu'ici !</p>
          <button
            className={`btn primary big ${holding ? "holding" : ""}`}
            onPointerDown={start}
            onPointerUp={stop}
            onPointerLeave={stop}
          >
            MAINTIENS-MOI
          </button>
        </div>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function BrainPuzzle() {
  const [progress, setProgress] = useState(loadProgress);
  const [levelIndex, setLevelIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showSolved, setShowSolved] = useState(false);
  const [screen, setScreen] = useState("menu"); // menu | game | finished
  const { pieces, burst } = useConfetti();

  useEffect(() => saveProgress(progress), [progress]);

  const level = LEVELS[levelIndex];

  const handleSolved = useCallback(() => {
    if (showSolved) return;
    setShowSolved(true);
    burst();
    setProgress((p) => ({
      ...p,
      unlocked: Math.max(p.unlocked, level.id + 1),
      stars: { ...p.stars, [level.id]: 3 },
    }));
  }, [showSolved, burst, level]);

  const goNext = () => {
    setShowSolved(false);
    setShowHint(false);
    if (levelIndex + 1 < LEVELS.length) {
      setLevelIndex((i) => i + 1);
    } else {
      setScreen("finished");
    }
  };

  const useHint = () => {
    if (progress.hints > 0) {
      setProgress((p) => ({ ...p, hints: p.hints - 1 }));
      setShowHint(true);
    }
  };

  return (
    <div className="app-root">
      <style>{STYLES}</style>

      {screen === "menu" && (
        <MenuScreen
          progress={progress}
          onPlay={(idx) => {
            setLevelIndex(idx);
            setShowSolved(false);
            setShowHint(false);
            setScreen("game");
          }}
        />
      )}

      {screen === "game" && (
        <div className="game-screen">
          <header className="topbar">
            <button className="icon-btn" onClick={() => setScreen("menu")}>
              ←
            </button>
            <div className="level-badge">Niveau {level.id}</div>
            <button className="icon-btn hint-btn" onClick={useHint}>
              💡 {progress.hints}
            </button>
          </header>

          <h2 className="title">{level.title}</h2>
          <p className="instruction">{level.instruction}</p>

          {showHint && <div className="hint-box">💡 {level.hint}</div>}

          <level.Component key={level.id} onSolved={handleSolved} />

          {showSolved && (
            <div className="solved-overlay">
              <div className="solved-card">
                <div className="stars">⭐️⭐️⭐️</div>
                <h3>Résolu !</h3>
                <button className="btn primary" onClick={goNext}>
                  {levelIndex + 1 < LEVELS.length ? "Niveau suivant →" : "Terminer 🎉"}
                </button>
              </div>
            </div>
          )}

          {pieces.map((p) => (
            <span
              key={p.id}
              className="confetti"
              style={{
                left: `${p.left}%`,
                backgroundColor: p.color,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                transform: `rotate(${p.rotate}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {screen === "finished" && (
        <div className="finished-screen">
          <h1>🏆 Félicitations !</h1>
          <p>Tu as résolu tous les casse-têtes.</p>
          <button className="btn primary" onClick={() => setScreen("menu")}>
            Retour au menu
          </button>
        </div>
      )}
    </div>
  );
}

function MenuScreen({ progress, onPlay }) {
  return (
    <div className="menu-screen">
      <h1 className="app-title">🧠 Brain Puzzle</h1>
      <p className="app-subtitle">Des énigmes malicieuses, une seule vraie solution.</p>
      <div className="level-list">
        {LEVELS.map((lvl, idx) => {
          const locked = lvl.id > progress.unlocked;
          const stars = progress.stars[lvl.id] || 0;
          return (
            <button
              key={lvl.id}
              disabled={locked}
              className={`level-tile ${locked ? "locked" : ""}`}
              onClick={() => onPlay(idx)}
            >
              <span className="level-number">{lvl.id}</span>
              <span className="level-title">{locked ? "🔒" : lvl.title}</span>
              {!locked && (
                <span className="level-stars">
                  {"⭐️".repeat(stars) || "☆☆☆"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (mobile-first, pensé iPhone : safe-area, gros boutons tactiles)
// ---------------------------------------------------------------------------

const STYLES = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.app-root {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  min-height: 100vh;
  background: linear-gradient(160deg, #1B1035, #2E1A5C 60%, #472B7A);
  color: #fff;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  overflow-x: hidden;
}
.menu-screen { padding: 32px 20px; text-align: center; }
.app-title { font-size: 2.2rem; margin: 12px 0 4px; }
.app-subtitle { opacity: 0.8; margin-bottom: 24px; font-size: 0.95rem; }
.level-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.level-tile {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 18px;
  padding: 16px 10px;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  min-height: 92px;
  justify-content: center;
  transition: transform 0.15s ease;
}
.level-tile:active { transform: scale(0.95); }
.level-tile.locked { opacity: 0.35; }
.level-number {
  width: 26px; height: 26px; border-radius: 50%;
  background: #4FA8FF; display: flex; align-items: center; justify-content: center;
  font-weight: bold; font-size: 0.8rem;
}
.level-stars { font-size: 0.7rem; }

.game-screen { padding: 16px 18px 40px; position: relative; min-height: 100vh; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.icon-btn {
  background: rgba(255,255,255,0.12);
  border: none; color: #fff; border-radius: 12px;
  width: 44px; height: 44px; font-size: 1.1rem;
}
.hint-btn { width: auto; padding: 0 14px; font-size: 0.9rem; }
.level-badge { font-weight: 600; opacity: 0.85; }
.title { font-size: 1.4rem; margin: 4px 0; text-align: center; }
.instruction { text-align: center; opacity: 0.85; margin-bottom: 18px; font-size: 0.95rem; }
.hint-box {
  background: rgba(255, 201, 60, 0.15);
  border: 1px solid #FFC93C;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.stage {
  background: rgba(255,255,255,0.06);
  border-radius: 22px;
  padding: 28px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-height: 320px;
  justify-content: center;
  position: relative;
}
.flavor { font-size: 1.4rem; text-align: center; }
.tip { font-size: 0.85rem; opacity: 0.75; min-height: 1em; }

.btn {
  border: none; border-radius: 16px; padding: 14px 26px;
  font-size: 1rem; font-weight: 600; cursor: pointer;
}
.btn.primary { background: linear-gradient(135deg, #4FA8FF, #6C63FF); color: #fff; }
.btn.big { padding: 22px 40px; font-size: 1.1rem; }
.btn.holding { transform: scale(0.92); background: linear-gradient(135deg, #4CD787, #2FB86A); }
.btn.choice { background: rgba(255,255,255,0.14); color: #fff; }
.btn.choice.small { padding: 8px 14px; font-size: 0.85rem; }
.btn.dodge { transform: translateX(60px); transition: transform 0.25s ease; }

.rocket { font-size: 3rem; }

.grid4 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; width: 100%; }

.river { display: flex; gap: 24px; }
.animal {
  background: rgba(255,255,255,0.1); border: none; border-radius: 14px;
  font-size: 2rem; padding: 10px 14px; transition: transform 0.3s ease;
}
.animal.crossed { transform: translateY(-8px) scale(1.1); background: rgba(76,215,135,0.3); }

.cat { font-size: 4rem; cursor: pointer; user-select: none; }

.weights { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

.clock { font-size: 4rem; cursor: pointer; user-select: none; transition: transform 0.2s ease; }

.code-input {
  font-size: 1.6rem; letter-spacing: 8px; text-align: center;
  width: 140px; padding: 10px; border-radius: 12px; border: none;
}

.bubbleField { position: relative; width: 100%; height: 260px; }
.bubble {
  position: absolute; background: none; border: none; font-size: 2rem; cursor: pointer;
}

.mirrorFrame {
  width: 140px; height: 140px; border: 4px solid #B57BFF; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; font-size: 3rem;
  background: rgba(255,255,255,0.05);
}
.realApple {
  background: none; border: 2px dashed rgba(255,255,255,0.3); border-radius: 12px;
  font-size: 3rem; padding: 6px 16px;
}

.solved-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; z-index: 10;
}
.solved-card {
  background: #2E1A5C; border-radius: 22px; padding: 30px 26px; text-align: center;
  border: 1px solid rgba(255,255,255,0.15);
}
.stars { font-size: 1.6rem; margin-bottom: 8px; }

.confetti {
  position: fixed; top: -10px; width: 8px; height: 14px; z-index: 20;
  animation-name: fall; animation-timing-function: ease-in; animation-fill-mode: forwards;
}
@keyframes fall {
  to { transform: translateY(110vh) rotate(360deg); opacity: 0.3; }
}

.finished-screen {
  min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; text-align: center; padding: 20px;
}
`;
