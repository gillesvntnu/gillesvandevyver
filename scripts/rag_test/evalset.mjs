// Hand-built relevance judgements, grounded in the actual corpus.
//
// Each query carries two kinds of ground truth:
//   docs  - documents that genuinely answer it (document-level relevance)
//   must  - a fact that a correct passage has to contain (passage-level)
// Document-level alone is too lenient, because a 255-article encyclopedia has
// several articles touching most topics; requiring the fact text is what
// separates "right article" from "right passage".
//
// Every `must` pattern below was checked against the built corpus before being
// written down, so a failure here is a retrieval failure and never a judgement
// that was wrong to begin with.
//
// The set is deliberately not all easy. Three kinds of hard query are included
// on purpose, because they are the ones that distinguish hybrid retrieval from
// either half of it:
//   - polysemy, where the lexical half is actively wrong. "Trail" in the
//     steering sense is swamped by rail-trail and trail-riding, which use the
//     word to mean a path and mention it more often.
//   - paraphrase, where the question shares no content word with the answer
//     ("why does a moving bike stay upright" vs "self-stability").
//   - near-synonym articles, where several type-of-bicycle articles describe
//     overlapping things and the distinguishing sentence is the target.
export const QUERIES = [
  // --- mechanics -----------------------------------------------------------
  { q: 'How do rim brakes differ from disc brakes?', docs: ['bicycle-brake'], must: /disc brake|rim brake/i },
  { q: 'How does a derailleur move the chain between sprockets?', docs: ['derailleur', 'bicycle-gearing', 'bicycle-drivetrain-systems'], must: /derailleur/i },
  { q: 'How does an internal hub gear work?', docs: ['hub-gear', 'bicycle-gearing'], must: /planetary|epicyclic|sun gear/i },
  { q: 'What stops a freewheel from driving the pedals backwards?', docs: ['freewheel', 'freehub', 'fixed-gear-bicycle'], must: /ratchet|pawl/i },
  { q: 'Why are bicycle wheel spokes tensioned?', docs: ['bicycle-wheel', 'spoke'], must: /tension/i },
  { q: 'What is the difference between a Presta and a Schrader valve?', docs: ['presta-valve', 'valve-stem', 'inner-tube'], must: /presta|schrader/i },
  { q: 'How is a roller chain constructed?', docs: ['roller-chain', 'bicycle-chain'], must: /roller|bushing|side plate/i },
  { q: 'What does bicycle suspension do on rough ground?', docs: ['bicycle-suspension', 'mountain-bike', 'softail'], must: /suspension|damp|absorb/i },

  // --- physics and dynamics ------------------------------------------------
  // Paraphrase: the answer is the phrase "self-stability", which the question
  // does not contain.
  { q: 'Why does a moving bicycle stay upright on its own?', docs: ['bicycle-and-motorcycle-dynamics', 'two-mass-skate-bicycle'], must: /self-?stab|balanc|upright/i },
  // Polysemy: "trail" as steering geometry against "trail" as a path.
  { q: 'What is trail in bicycle steering geometry?', docs: ['bicycle-and-motorcycle-geometry', 'bicycle-and-motorcycle-dynamics', 'bicycle-fork'], must: /trail/i },
  { q: 'Do gyroscopic forces keep a bicycle balanced?', docs: ['bicycle-and-motorcycle-dynamics', 'two-mass-skate-bicycle'], must: /gyroscop/i },
  { q: 'What is countersteering and why is it necessary to turn?', docs: ['countersteering', 'bicycle-and-motorcycle-dynamics'], must: /countersteer/i },
  { q: 'What causes rolling resistance in a tyre?', docs: ['rolling-resistance', 'bicycle-tire'], must: /rolling resistance|deform|hysteres/i },
  { q: 'How much of a cyclist power output goes into air drag?', docs: ['bicycle-performance', 'drag-physics', 'rolling-resistance'], must: /drag|aerodynamic|air resistance/i },
  { q: 'What causes speed wobble in the front wheel?', docs: ['speed-wobble', 'bicycle-and-motorcycle-dynamics'], must: /wobble|shimmy|oscillat/i },

  // --- measurement ---------------------------------------------------------
  { q: 'How does a cycling power meter measure watts?', docs: ['cycling-power-meter'], must: /strain gauge|torque|watt/i },
  { q: 'What pedalling cadence do riders typically use?', docs: ['cadence-cycling'], must: /rpm|revolutions per minute/i },
  { q: 'How are gear ratios expressed in gear inches?', docs: ['bicycle-gearing'], must: /gear inch|gain ratio|development/i },
  { q: 'How is climbing rate measured in metres per hour?', docs: ['vam-bicycling', 'cumulative-elevation-gain'], must: /VAM|vertical|metres per hour|elevation/i },

  // --- types of bicycle ----------------------------------------------------
  // Near-synonym articles: several type articles describe a drop-bar bike on
  // mixed surfaces, and the distinguishing sentence is the target.
  { q: 'What distinguishes a gravel bike from a cyclocross bike?', docs: ['gravel-bicycle', 'cyclo-cross-bicycle', 'road-bicycle'], must: /gravel|cyclo-?cross/i },
  { q: 'Why do recumbent bicycles have lower air resistance?', docs: ['recumbent-bicycle', 'bicycle-fairing'], must: /recumbent|aerodynamic|frontal area/i },
  { q: 'How much assistance can an electric bicycle motor provide?', docs: ['e-bike', 'bicycle-law'], must: /watt|motor|assist/i },
  { q: 'What loads can a cargo bike carry?', docs: ['cargo-bike', 'bicycle-trailer', 'utility-cycling'], must: /cargo|load|carry/i },

  // --- safety --------------------------------------------------------------
  { q: 'Do bicycle helmets reduce the risk of head injury?', docs: ['bicycle-helmet'], must: /helmet/i },
  { q: 'What is the safety in numbers effect for cyclists?', docs: ['safety-in-numbers', 'safety-of-cycling-infrastructure', 'cycling'], must: /safety in numbers|more cyclists|numbers/i },
  { q: 'What is dooring and how is it avoided?', docs: ['dooring', 'bicycle-safety', 'bike-lane'], must: /door/i },

  // --- infrastructure and history ------------------------------------------
  { q: 'How does a protected intersection keep cyclists separated from traffic?', docs: ['protected-intersection', 'cycling-infrastructure', 'cycle-track'], must: /intersection|corner island|separat/i },
  { q: 'How do docked bike sharing systems work?', docs: ['bicycle-sharing-system', 'copenhagen-city-bikes'], must: /dock|station|kiosk/i },
  { q: 'Why was the safety bicycle safer than the penny-farthing?', docs: ['safety-bicycle', 'history-of-the-bicycle'], must: /penny-?farthing|high-?wheel|safety bicycle/i },
  { q: 'When was the first pedal-less running bicycle invented?', docs: ['history-of-the-bicycle', 'balance-bike', 'bicycle'], must: /1817|draisine|dandy horse|velocipede/i },
];

// Questions the corpus cannot answer. Used only by the calibration probe, which
// needs both sides of the distribution to place a floor between them: the point
// is that a confident-looking score on one of these is what the floor exists to
// catch. Mixed deliberately - two are off-topic, two sound like cycling
// questions but are about facts no encyclopedia article here carries, and one is
// gibberish, because a floor tuned only on nonsense sits too low to catch the
// plausible-but-absent case.
export const UNANSWERABLE = [
  'What is the capital of Mongolia?',
  'How do I file a Norwegian tax return?',
  'Which brand of chain lubricant did Gilles buy last Tuesday?',
  'What was the winning time in the 2027 Tour de France prologue?',
  'asdf qwerty zxcv plugh',
];
