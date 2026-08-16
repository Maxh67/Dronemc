import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

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
// Utilitaires : sauvegarde, haptique, sons synthétisés (aucun asset requis)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "brainpuzzle_progress_v2";
const TOTAL_HINTS_DEFAULT = 3;

function loadProgress() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return { unlocked: 1, stars: {}, hints: TOTAL_HINTS_DEFAULT, streak: 0, bestStreak: 0, soundOn: true };
    const parsed = JSON.parse(raw);
    return { streak: 0, bestStreak: 0, soundOn: true, ...parsed };
  } catch {
    return { unlocked: 1, stars: {}, hints: TOTAL_HINTS_DEFAULT, streak: 0, bestStreak: 0, soundOn: true };
  }
}

function saveProgress(progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* stockage indisponible, on continue sans persister */
  }
}

function vibrate(pattern) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

/** Petit moteur audio 100% synthétisé (Web Audio API) — zéro fichier son. */
function useSoundEngine(enabled) {
  const ctxRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!enabled) return null;
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctxRef.current) ctxRef.current = new AC();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, [enabled]);

  const tone = useCallback(
    (freq, duration, type = "sine", startGain = 0.18, delay = 0) => {
      const ctx = getCtx();
      if (!ctx) return;
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(startGain, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    },
    [getCtx]
  );

  return useMemo(
    () => ({
      tap: () => tone(520, 0.07, "triangle", 0.12),
      pop: () => tone(880, 0.09, "sine", 0.15),
      wrong: () => {
        tone(180, 0.18, "sawtooth", 0.14);
        tone(140, 0.22, "sawtooth", 0.1, 0.05);
      },
      success: () => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, "sine", 0.16, i * 0.09));
      },
      unlock: () => {
        tone(660, 0.12, "square", 0.1);
        tone(990, 0.16, "square", 0.1, 0.1);
      },
      click: () => tone(340, 0.05, "triangle", 0.1),
    }),
    [tone]
  );
}

function useConfetti() {
  const [pieces, setPieces] = useState([]);
  const burst = useCallback(() => {
    const colors = ["#FF5D5D", "#FFC93C", "#4CD787", "#4FA8FF", "#B57BFF", "#FF8FE0"];
    const next = Array.from({ length: 46 }).map((_, i) => ({
      id: `${Date.now()}-${i}`,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.3,
      rotate: Math.random() * 360,
      duration: 1.4 + Math.random() * 0.9,
      size: 6 + Math.random() * 6,
    }));
    setPieces(next);
    setTimeout(() => setPieces([]), 2500);
  }, []);
  return { pieces, burst };
}

/** Anime un compteur de score qui monte en flèche à l'écran de fin de niveau. */
function useCountUp(target, active) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) {
      setVal(0);
      return;
    }
    let raf;
    const start = performance.now();
    const dur = 650;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return val;
}

// ---------------------------------------------------------------------------
// Définition des niveaux — 16 énigmes piégeuses
// Chaque Component reçoit { onSolved, onWrong, sound }
// ---------------------------------------------------------------------------

const LEVELS = [
  {
    id: 1,
    title: "Le bouton têtu",
    instruction: "Appuie sur le bouton START pour lancer la fusée.",
    hint: "Le bouton fuit ta souris ! Approche-le une fois, puis clique dessus une fois qu'il a bougé.",
    Component: ({ onSolved }) => {
      const [moved, setMoved] = useState(false);
      return (
        <div className="stage">
          <p className="flavor">La fusée refuse de décoller...</p>
          <div className="rocket bob">🚀</div>
          <button
            className={`btn primary ${moved ? "dodge" : ""}`}
            onMouseEnter={() => setMoved(true)}
            onTouchStart={() => setMoved(true)}
            onClick={() => moved && onSolved()}
          >
            START
          </button>
        </div>
      );
    },
  },
  {
    id: 2,
    title: "Compte les moutons",
    instruction: "Combien de VRAIS moutons vois-tu à l'écran ?",
    hint: "Un des moutons est un loup déguisé, et un mouton se cache derrière le nuage : 5 - 1 loup + 1 caché = 5... mais recompte bien !",
    Component: ({ onSolved, onWrong }) => {
      const answer = 4;
      return (
        <div className="stage">
          <p className="flavor big-emoji">🐑 🐺 🐑 ☁️🐑 🐑</p>
          <p className="tip">(un nuage cache peut-être quelque chose...)</p>
          <div className="grid4">
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                className="btn choice"
                onClick={() => (n === answer ? onSolved() : onWrong())}
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
    instruction: "Fais traverser la rivière au loup, à la chèvre et au chou.",
    hint: "Oublie les règles classiques : ici tu peux juste faire traverser les trois d'un coup.",
    Component: ({ onSolved }) => {
      const [side, setSide] = useState({ loup: "A", chevre: "A", chou: "A" });
      return (
        <div className="stage">
          <p className="flavor">🌊 Touche chaque personnage pour le faire traverser</p>
          <div className="river">
            {Object.entries(side).map(([k, v]) => (
              <button
                key={k}
                className={`animal ${v === "B" ? "crossed" : ""}`}
                onClick={() =>
                  setSide((s) => {
                    const ns = { ...s, [k]: s[k] === "A" ? "B" : "A" };
                    if (Object.values(ns).every((x) => x === "B")) setTimeout(onSolved, 200);
                    return ns;
                  })
                }
              >
                {k === "loup" ? "🐺" : k === "chevre" ? "🐐" : "🥬"}
              </button>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 4,
    title: "Réveille le chat",
    instruction: "Le chat dort profondément. Trouve un moyen de le réveiller.",
    hint: "Chatouille-le plusieurs fois de suite jusqu'à ce qu'il ouvre l'œil.",
    Component: ({ onSolved }) => {
      const [taps, setTaps] = useState(0);
      return (
        <div className="stage">
          <p className="flavor big-emoji">{taps >= 5 ? "😺" : "😴"}</p>
          <div className="cat" onClick={() => setTaps((t) => (t + 1 >= 5 ? (onSolved(), t + 1) : t + 1))}>
            🐱
          </div>
          <div className="progress-dots">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`dot ${i < taps ? "on" : ""}`} />
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 5,
    title: "La balance truquée",
    instruction: "Équilibre parfaitement la balance.",
    hint: "Aucune combinaison ne s'équilibre. Retire TOUS les poids : une balance vide est équilibrée.",
    Component: ({ onSolved }) => {
      const [weights, setWeights] = useState([2, 3, 5]);
      return (
        <div className="stage">
          <p className="flavor big-emoji">⚖️</p>
          <div className="weights">
            {weights.length === 0 && <span className="tip">(vide)</span>}
            {weights.map((w, i) => (
              <button key={i} className="btn choice small" onClick={() => setWeights((ws) => ws.filter((_, j) => j !== i))}>
                {w}kg 🗑️
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={() => weights.length === 0 && onSolved()}>
            Vérifier l'équilibre
          </button>
        </div>
      );
    },
  },
  {
    id: 6,
    title: "L'horloge cassée",
    instruction: "Règle l'horloge pour qu'il soit exactement midi.",
    hint: "Les aiguilles sont trompeuses : fais pivoter l'HORLOGE entière en tapant dessus.",
    Component: ({ onSolved }) => {
      const [rotation, setRotation] = useState(0);
      const normalized = ((rotation % 360) + 360) % 360;
      const isNoon = normalized < 15 || normalized > 345;
      return (
        <div className="stage">
          <p className="flavor">🕰️ Tape pour faire tourner l'horloge</p>
          <div className="clock" style={{ transform: `rotate(${rotation}deg)` }} onClick={() => setRotation((r) => r + 30)}>
            🕛
          </div>
          <button className="btn primary" onClick={() => isNoon && onSolved()}>
            Valider midi
          </button>
        </div>
      );
    },
  },
  {
    id: 7,
    title: "Le coffre-fort",
    instruction: "Trouve le code à 3 chiffres grâce aux indices de la pièce.",
    hint: "Compte : fenêtres (2), tableaux (1), plantes (4) → 214.",
    Component: ({ onSolved, onWrong }) => {
      const [code, setCode] = useState("");
      return (
        <div className="stage">
          <p className="flavor big-emoji">🪟🪟 🖼️ 🪴🪴🪴🪴</p>
          <input
            className="code-input"
            inputMode="numeric"
            maxLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="---"
          />
          <button
            className="btn primary"
            onClick={() => {
              if (code.length < 3) return;
              code === "214" ? onSolved() : onWrong();
            }}
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
    instruction: "Fais éclater toutes les bulles.",
    hint: "Certaines se cachent dans les coins ! Regarde bien tous les recoins de la zone.",
    Component: ({ onSolved }) => {
      const initial = useMemo(() => Array.from({ length: 10 }).map((_, i) => i), []);
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
                style={{ left: `${(b * 37) % 88}%`, top: `${(b * 53) % 82}%` }}
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
    hint: "Tout ce qui est dans le cadre est un reflet. Touche la pomme à l'extérieur, dans le pointillé.",
    Component: ({ onSolved, onWrong }) => (
      <div className="stage">
        <p className="flavor">🪞 Miroir</p>
        <div className="mirrorFrame" onClick={onWrong}>
          <div className="mirrorReflection">🍎</div>
        </div>
        <button className="realApple" onClick={onSolved}>
          🍏
        </button>
      </div>
    ),
  },
  {
    id: 10,
    title: "Trie les couleurs",
    instruction: "Appuie sur les boutons dans l'ordre : Rouge, puis Bleu, puis Vert.",
    hint: "Lis bien : l'ordre demandé est Rouge → Bleu → Vert, pas l'ordre affiché à l'écran.",
    Component: ({ onSolved, onWrong }) => {
      const order = ["red", "blue", "green"];
      const [step, setStep] = useState(0);
      const colors = [
        { id: "green", label: "Vert", css: "#4CD787" },
        { id: "red", label: "Rouge", css: "#FF5D5D" },
        { id: "blue", label: "Bleu", css: "#4FA8FF" },
      ];
      return (
        <div className="stage">
          <p className="flavor">🎨 Rouge → Bleu → Vert</p>
          <div className="colorRow">
            {colors.map((c) => (
              <button
                key={c.id}
                className="colorBtn"
                style={{ background: c.css }}
                onClick={() => {
                  if (c.id === order[step]) {
                    if (step + 1 === order.length) onSolved();
                    else setStep((s) => s + 1);
                  } else {
                    setStep(0);
                    onWrong();
                  }
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="progress-dots">
            {order.map((_, i) => (
              <span key={i} className={`dot ${i < step ? "on" : ""}`} />
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 11,
    title: "Le mot caché",
    instruction: "Appuie sur le mot 'CHAT' le plus vite possible.",
    hint: "Il y a plusieurs faux mots ressemblants (CHAT en majuscule stylisée, CHÂT, CMAT...) : cherche l'orthographe exacte C-H-A-T.",
    Component: ({ onSolved, onWrong }) => {
      const words = useMemo(() => {
        const decoys = ["CHÂT", "CMAT", "CHAT'", "СHAT", "CHAТ", "CHAT"];
        return decoys.sort(() => Math.random() - 0.5);
      }, []);
      return (
        <div className="stage">
          <p className="flavor">🔤 Trouve le vrai « CHAT »</p>
          <div className="wordGrid">
            {words.map((w, i) => (
              <button key={i} className="btn choice small" onClick={() => (w === "CHAT" ? onSolved() : onWrong())}>
                {w}
              </button>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 12,
    title: "Nourris le poisson",
    instruction: "Fais glisser la nourriture jusqu'au bocal pour nourrir le poisson.",
    hint: "Le poisson n'a pas besoin de nourriture : touche directement le poisson, il a juste faim d'attention !",
    Component: ({ onSolved, onWrong }) => (
      <div className="stage">
        <p className="flavor">🐠 Bocal à poisson</p>
        <div className="fishbowl">
          <span className="fish" onClick={onSolved}>
            🐟
          </span>
        </div>
        <button className="btn choice" onClick={onWrong}>
          🍞 Donner la nourriture
        </button>
      </div>
    ),
  },
  {
    id: 13,
    title: "Le puzzle inversé",
    instruction: "Remets les 3 pièces dans l'ordre croissant 1-2-3.",
    hint: "Les étiquettes mentent : la pièce qui affiche « 1 » doit en réalité aller en dernier. Fie-toi à l'ordre logique, pas au texte.",
    Component: ({ onSolved }) => {
      // Pièces affichées avec labels trompeurs; l'ordre correct de clic est piece C, A, B
      const [clicked, setClicked] = useState([]);
      const correctOrder = ["C", "A", "B"];
      const pieces = [
        { id: "A", label: "1" },
        { id: "B", label: "2" },
        { id: "C", label: "3" },
      ];
      return (
        <div className="stage">
          <p className="flavor">🧩 Touche les pièces dans le bon ordre logique</p>
          <div className="puzzleRow">
            {pieces.map((p) => (
              <button
                key={p.id}
                disabled={clicked.includes(p.id)}
                className={`puzzlePiece ${clicked.includes(p.id) ? "used" : ""}`}
                onClick={() => {
                  const next = [...clicked, p.id];
                  const isCorrectSoFar = next.every((v, i) => v === correctOrder[i]);
                  if (!isCorrectSoFar) {
                    setClicked([]);
                    return;
                  }
                  setClicked(next);
                  if (next.length === 3) onSolved();
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="tip">Ordre : {clicked.join(" → ") || "—"}</p>
        </div>
      );
    },
  },
  {
    id: 14,
    title: "Le labyrinthe pressé",
    instruction: "Trouve la sortie du labyrinthe avant la fin du temps.",
    hint: "Il n'y a pas de vrai labyrinthe : appuie directement sur la case « SORTIE » visible dans le coin.",
    Component: ({ onSolved }) => (
      <div className="stage">
        <p className="flavor">🌀 Labyrinthe</p>
        <div className="mazeGrid">
          {Array.from({ length: 9 }).map((_, i) =>
            i === 8 ? (
              <button key={i} className="mazeExit" onClick={onSolved}>
                🚪
              </button>
            ) : (
              <div key={i} className="mazeWall" />
            )
          )}
        </div>
      </div>
    ),
  },
  {
    id: 15,
    title: "L'addition impossible",
    instruction: "Combien font 5 + 3 sur ce clavier cassé ?",
    hint: "Le clavier n'affiche pas les bons chiffres au bon endroit : cherche le VRAI 8, pas le bouton qui affiche « 8 ».",
    Component: ({ onSolved, onWrong }) => {
      const options = useMemo(() => {
        const arr = [
          { label: "8", real: false },
          { label: "6", real: false },
          { label: "٨", real: true }, // le vrai 8 en chiffre arabe-indien, indice discret
          { label: "9", real: false },
        ];
        return arr.sort(() => Math.random() - 0.5);
      }, []);
      return (
        <div className="stage">
          <p className="flavor">🧮 5 + 3 = ?</p>
          <p className="tip">(un des boutons ment sur son propre chiffre...)</p>
          <div className="grid4">
            {options.map((o, i) => (
              <button key={i} className="btn choice" onClick={() => (o.real ? onSolved() : onWrong())}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    id: 16,
    title: "Le dernier niveau",
    instruction: "Appuie 100 fois sur le bouton pour gagner le jeu.",
    hint: "Personne n'a le temps de taper 100 fois : maintiens le bouton enfoncé quelques secondes.",
    Component: ({ onSolved }) => {
      const [holding, setHolding] = useState(false);
      const [progressPct, setProgressPct] = useState(0);
      const timerRef = useRef(null);
      const rafRef = useRef(null);
      const start = () => {
        setHolding(true);
        const t0 = performance.now();
        const HOLD_MS = 1500;
        const tick = (now) => {
          const p = Math.min(100, ((now - t0) / HOLD_MS) * 100);
          setProgressPct(p);
          if (p < 100) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        timerRef.current = setTimeout(onSolved, HOLD_MS);
      };
      const stop = () => {
        setHolding(false);
        setProgressPct(0);
        clearTimeout(timerRef.current);
        cancelAnimationFrame(rafRef.current);
      };
      return (
        <div className="stage">
          <p className="flavor">🏆 Bravo d'être arrivé jusqu'ici !</p>
          <button
            className={`btn primary big ${holding ? "holding" : ""}`}
            onPointerDown={start}
            onPointerUp={stop}
            onPointerLeave={stop}
            style={{ backgroundSize: `${progressPct}% 100%` }}
          >
            MAINTIENS-MOI
          </button>
        </div>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Fond animé décoratif (blobs flottants) — pure CSS, léger
// ---------------------------------------------------------------------------

function AnimatedBackground() {
  return (
    <div className="bg-blobs" aria-hidden="true">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function BrainPuzzle() {
  const [progress, setProgress] = useState(loadProgress);
  const [levelIndex, setLevelIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showSolved, setShowSolved] = useState(false);
  const [screen, setScreen] = useState("menu"); // menu | game | finished
  const [shake, setShake] = useState(false);
  const [levelStartTime, setLevelStartTime] = useState(null);
  const [earnedStars, setEarnedStars] = useState(3);
  const [mistakes, setMistakes] = useState(0);
  const { pieces, burst } = useConfetti();
  const sound = useSoundEngine(progress.soundOn);

  useEffect(() => saveProgress(progress), [progress]);

  const level = LEVELS[levelIndex];
  const displayScore = useCountUp(earnedStars * 100 + Math.max(0, 50 - mistakes * 10), showSolved);

  const handleWrong = useCallback(() => {
    sound.wrong();
    vibrate(80);
    setMistakes((m) => m + 1);
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }, [sound]);

  const handleSolved = useCallback(() => {
    if (showSolved) return;
    const elapsed = levelStartTime ? (Date.now() - levelStartTime) / 1000 : 999;
    const stars = mistakes === 0 && elapsed < 20 ? 3 : mistakes <= 2 ? 2 : 1;
    setEarnedStars(stars);
    setShowSolved(true);
    sound.success();
    vibrate([30, 40, 30, 40, 60]);
    burst();
    setProgress((p) => {
      const wasLocked = level.id + 1 > p.unlocked;
      if (wasLocked) sound.unlock();
      const newStreak = p.streak + 1;
      return {
        ...p,
        unlocked: Math.max(p.unlocked, level.id + 1),
        stars: { ...p.stars, [level.id]: Math.max(p.stars[level.id] || 0, stars) },
        streak: newStreak,
        bestStreak: Math.max(p.bestStreak, newStreak),
      };
    });
  }, [showSolved, burst, level, levelStartTime, mistakes, sound]);

  const startLevel = (idx) => {
    setLevelIndex(idx);
    setShowSolved(false);
    setShowHint(false);
    setMistakes(0);
    setLevelStartTime(Date.now());
    setScreen("game");
  };

  const goNext = () => {
    if (levelIndex + 1 < LEVELS.length) {
      startLevel(levelIndex + 1);
    } else {
      setScreen("finished");
    }
  };

  const useHint = () => {
    if (progress.hints > 0 && !showHint) {
      sound.click();
      setProgress((p) => ({ ...p, hints: p.hints - 1 }));
      setShowHint(true);
    }
  };

  const toggleSound = () => setProgress((p) => ({ ...p, soundOn: !p.soundOn }));

  const totalStars = Object.values(progress.stars).reduce((a, b) => a + b, 0);

  return (
    <div className="app-root">
      <style>{STYLES}</style>
      <AnimatedBackground />

      {screen === "menu" && (
        <MenuScreen
          progress={progress}
          totalStars={totalStars}
          onPlay={(idx) => {
            sound.click();
            startLevel(idx);
          }}
          onToggleSound={toggleSound}
        />
      )}

      {screen === "game" && (
        <div className={`game-screen ${shake ? "shake" : ""}`}>
          <header className="topbar">
            <button
              className="icon-btn"
              onClick={() => {
                sound.click();
                setScreen("menu");
              }}
            >
              ←
            </button>
            <div className="level-badge">
              Niveau {level.id}
              {progress.streak > 1 && <span className="streak-chip">🔥{progress.streak}</span>}
            </div>
            <button className="icon-btn hint-btn" onClick={useHint} disabled={progress.hints === 0}>
              💡 {progress.hints}
            </button>
          </header>

          <h2 className="title">{level.title}</h2>
          <p className="instruction">{level.instruction}</p>

          {showHint && <div className="hint-box">💡 {level.hint}</div>}

          <level.Component key={level.id} onSolved={handleSolved} onWrong={handleWrong} sound={sound} />

          {showSolved && (
            <div className="solved-overlay">
              <div className="solved-card pop-in">
                <div className="stars">{"⭐️".repeat(earnedStars)}{"☆".repeat(3 - earnedStars)}</div>
                <h3>Résolu !</h3>
                <p className="score-line">Score : {displayScore}</p>
                <button
                  className="btn primary"
                  onClick={() => {
                    sound.click();
                    goNext();
                  }}
                >
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
                width: `${p.size}px`,
                height: `${p.size * 1.6}px`,
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
          <div className="trophy bob">🏆</div>
          <h1>Félicitations !</h1>
          <p>Tu as résolu tous les casse-têtes.</p>
          <p className="score-line">Total : {totalStars} / {LEVELS.length * 3} ⭐️</p>
          <p className="score-line">Meilleure série : 🔥{progress.bestStreak}</p>
          <button className="btn primary" onClick={() => setScreen("menu")}>
            Retour au menu
          </button>
        </div>
      )}
    </div>
  );
}

function MenuScreen({ progress, totalStars, onPlay, onToggleSound }) {
  const maxStars = LEVELS.length * 3;
  const pct = Math.round((totalStars / maxStars) * 100);
  return (
    <div className="menu-screen">
      <button className="sound-toggle" onClick={onToggleSound}>
        {progress.soundOn ? "🔊" : "🔇"}
      </button>
      <h1 className="app-title">🧠 Brain Puzzle</h1>
      <p className="app-subtitle">Des énigmes malicieuses, une seule vraie solution.</p>

      <div className="progress-bar-outer">
        <div className="progress-bar-inner" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">
        {totalStars} / {maxStars} ⭐️ {progress.bestStreak > 0 && `· meilleure série 🔥${progress.bestStreak}`}
      </p>

      <div className="level-list">
        {LEVELS.map((lvl, idx) => {
          const locked = lvl.id > progress.unlocked;
          const stars = progress.stars[lvl.id] || 0;
          return (
            <button key={lvl.id} disabled={locked} className={`level-tile ${locked ? "locked" : ""}`} onClick={() => onPlay(idx)}>
              <span className="level-number">{lvl.id}</span>
              <span className="level-title">{locked ? "🔒" : lvl.title}</span>
              {!locked && <span className="level-stars">{"⭐️".repeat(stars) || "☆☆☆"}</span>}
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
  position: relative;
}

.bg-blobs { position: fixed; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; }
.blob { position: absolute; border-radius: 50%; filter: blur(50px); opacity: 0.35; }
.b1 { width: 220px; height: 220px; background: #4FA8FF; top: -60px; left: -60px; animation: drift1 14s ease-in-out infinite; }
.b2 { width: 260px; height: 260px; background: #B57BFF; bottom: -80px; right: -60px; animation: drift2 18s ease-in-out infinite; }
.b3 { width: 180px; height: 180px; background: #FF8FE0; top: 40%; left: 60%; animation: drift3 16s ease-in-out infinite; }
@keyframes drift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px, 60px); } }
@keyframes drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px, -30px); } }
@keyframes drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px, 40px) scale(1.15); } }

.menu-screen, .game-screen, .finished-screen { position: relative; z-index: 1; }

.menu-screen { padding: 32px 20px; text-align: center; }
.sound-toggle {
  position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.1);
  border: none; border-radius: 12px; width: 42px; height: 42px; font-size: 1.1rem; color: #fff;
}
.app-title { font-size: 2.2rem; margin: 12px 0 4px; }
.app-subtitle { opacity: 0.8; margin-bottom: 18px; font-size: 0.95rem; }

.progress-bar-outer {
  height: 10px; border-radius: 6px; background: rgba(255,255,255,0.12);
  overflow: hidden; margin: 0 auto 6px; max-width: 320px;
}
.progress-bar-inner {
  height: 100%; background: linear-gradient(90deg, #4FA8FF, #B57BFF);
  transition: width 0.5s ease;
}
.progress-label { font-size: 0.8rem; opacity: 0.75; margin-bottom: 20px; }

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

.game-screen { padding: 16px 18px 40px; position: relative; min-height: 100vh; transition: transform 0.05s; }
.game-screen.shake { animation: shakeScreen 0.4s; }
@keyframes shakeScreen {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-8px); }
  40%, 60% { transform: translateX(8px); }
}

.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.icon-btn {
  background: rgba(255,255,255,0.12);
  border: none; color: #fff; border-radius: 12px;
  width: 44px; height: 44px; font-size: 1.1rem;
}
.icon-btn:disabled { opacity: 0.4; }
.hint-btn { width: auto; padding: 0 14px; font-size: 0.9rem; }
.level-badge { font-weight: 600; opacity: 0.9; display: flex; align-items: center; gap: 6px; }
.streak-chip {
  background: rgba(255, 140, 0, 0.2); border: 1px solid #FF8C00;
  border-radius: 10px; padding: 1px 7px; font-size: 0.75rem;
}
.title { font-size: 1.4rem; margin: 4px 0; text-align: center; }
.instruction { text-align: center; opacity: 0.85; margin-bottom: 18px; font-size: 0.95rem; }
.hint-box {
  background: rgba(255, 201, 60, 0.15);
  border: 1px solid #FFC93C;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  animation: fadeSlideIn 0.3s ease;
}
@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

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
.big-emoji { font-size: 1.6rem; letter-spacing: 2px; }
.tip { font-size: 0.85rem; opacity: 0.75; min-height: 1em; }

.btn {
  border: none; border-radius: 16px; padding: 14px 26px;
  font-size: 1rem; font-weight: 600; cursor: pointer;
  transition: transform 0.12s ease;
}
.btn:active { transform: scale(0.94); }
.btn.primary {
  background: linear-gradient(135deg, #4FA8FF, #6C63FF);
  background-repeat: no-repeat;
  color: #fff;
}
.btn.big { padding: 22px 40px; font-size: 1.1rem; background-color: rgba(255,255,255,0.08); }
.btn.holding { transform: scale(0.92); }
.btn.choice { background: rgba(255,255,255,0.14); color: #fff; }
.btn.choice.small { padding: 8px 14px; font-size: 0.85rem; }
.btn.dodge { transform: translateX(60px); transition: transform 0.25s ease; }

.bob { animation: bob 2.2s ease-in-out infinite; }
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

.rocket { font-size: 3rem; }

.grid4 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; width: 100%; }

.river { display: flex; gap: 24px; }
.animal {
  background: rgba(255,255,255,0.1); border: none; border-radius: 14px;
  font-size: 2rem; padding: 10px 14px; transition: transform 0.3s ease;
}
.animal.crossed { transform: translateY(-8px) scale(1.1); background: rgba(76,215,135,0.3); }

.cat { font-size: 4rem; cursor: pointer; user-select: none; transition: transform 0.15s ease; }
.cat:active { transform: scale(0.9) rotate(-6deg); }

.progress-dots { display: flex; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.2); }
.dot.on { background: #4CD787; }

.weights { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; min-height: 40px; align-items: center; }

.clock { font-size: 4rem; cursor: pointer; user-select: none; transition: transform 0.2s ease; }

.code-input {
  font-size: 1.6rem; letter-spacing: 8px; text-align: center;
  width: 140px; padding: 10px; border-radius: 12px; border: none;
}

.bubbleField { position: relative; width: 100%; height: 260px; }
.bubble {
  position: absolute; background: none; border: none; font-size: 2rem; cursor: pointer;
  animation: floatBubble 3s ease-in-out infinite;
}
@keyframes floatBubble { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

.mirrorFrame {
  width: 140px; height: 140px; border: 4px solid #B57BFF; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; font-size: 3rem;
  background: rgba(255,255,255,0.05); cursor: pointer;
}
.realApple {
  background: none; border: 2px dashed rgba(255,255,255,0.3); border-radius: 12px;
  font-size: 3rem; padding: 6px 16px;
}

.colorRow { display: flex; gap: 10px; }
.colorBtn { border: none; border-radius: 14px; padding: 16px 18px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }

.wordGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

.fishbowl {
  width: 160px; height: 120px; border-radius: 50% 50% 40% 40% / 60% 60% 40% 40%;
  background: rgba(79,168,255,0.25); border: 3px solid rgba(255,255,255,0.3);
  display: flex; align-items: center; justify-content: center;
}
.fish { font-size: 2.6rem; cursor: pointer; display: inline-block; animation: swim 2.4s ease-in-out infinite; }
@keyframes swim { 0%,100% { transform: translateX(-10px); } 50% { transform: translateX(10px) scaleX(-1); } }

.puzzleRow { display: flex; gap: 12px; }
.puzzlePiece {
  width: 60px; height: 60px; border-radius: 14px; border: none;
  background: rgba(255,255,255,0.14); color: #fff; font-size: 1.4rem; font-weight: 700;
}
.puzzlePiece.used { opacity: 0.3; }

.mazeGrid { display: grid; grid-template-columns: repeat(3, 50px); gap: 6px; }
.mazeWall { width: 50px; height: 50px; background: rgba(255,255,255,0.08); border-radius: 8px; }
.mazeExit {
  width: 50px; height: 50px; border-radius: 8px; border: none;
  background: rgba(76,215,135,0.3); font-size: 1.4rem;
}

.solved-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; z-index: 10;
}
.solved-card { background: #2E1A5C; border-radius: 22px; padding: 30px 26px; text-align: center; border: 1px solid rgba(255,255,255,0.15); }
.pop-in { animation: popIn 0.35s cubic-bezier(.34,1.56,.64,1); }
@keyframes popIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
.stars { font-size: 1.8rem; margin-bottom: 8px; }
.score-line { opacity: 0.85; font-size: 0.9rem; margin: 4px 0 14px; }

.confetti {
  position: fixed; top: -10px; z-index: 20;
  animation-name: fall; animation-timing-function: ease-in; animation-fill-mode: forwards;
}
@keyframes fall { to { transform: translateY(110vh) rotate(360deg); opacity: 0.3; } }

.finished-screen {
  min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px; text-align: center; padding: 20px;
}
.trophy { font-size: 4rem; margin-bottom: 8px; }
`;
