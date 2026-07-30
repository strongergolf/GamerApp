// Default seed dataset — Mark Strong's Gamer Bag.
// Clubs, performance figures, profile, baseline weather and the swing-diagnosis tree.

const DEFAULT_DATA = {
  profile: { name:'Mark Strong', handicap:'+2', driverSwingSpeed:110,
    handedness:'RH', heightFt:'', heightIn:'', armToFloor:'', ageRange:'',
    roundsPerYear:'', practicePerYear:'', hcpService:'', hcpId:'',
    ballMake:'', ballModel:'', ballAlignment:'', ballNotes:'',
    ballCompression:'', ballCover:'', ballLayers:'', ballFirmness:'', ballSpin:'', ballTrajectory:'',
    gloveSize:'',
    /* typical-round baselines (feed "my actual" + scoring benchmarks) */
    scoringAvg:'', goalHcp:'', firPct:'', girPct:'', puttsRound:'', upDownPct:'',
    /* home setup — seeds Putting stimp + Plan */
    homeCourse:'', usualTee:'', homeStimp:'', coachMode:false,
    /* launch monitor profile */
    lmBrand:'', lmSessionDate:'', lmDriverAoA:'', lmDriverPath:'', lmDriverFace:'', lmSmash:'', lmNotes:'',
    /* course conditions */
    roughLength:'', greenGrass:'', fairwayGrass:'', roughGrass:'', bunkerSand:'' },
  baseline: { tempF:70, altitudeFt:0, humidity:50, pressureInHg:29.92 },   /* today's playing conditions (Environmental Adjustment); standard ref = STD_COND */
  densityK: 0.65,
  lmSessions: [],   /* saved launch-monitor driver sessions (Driver Optimizer) */
  stimp: 9.5,
  /* Short Game Variables (Short Game tab) — selected option id per variable.
     Keys/options defined in physics/shortgame-vars.js; defaults net to zero change. */
  sgVars: {},
  /* Short-game calibration — captured launch-monitor shots + the per-user launch/spin/roll
     factors derived from them (Short Game → Calibrate to My Data). Neutral until imported. */
  sgCal: { shots:[], launchOff:0, spinMult:1, rollMult:1 },
  scoring: {
    rounds: []
    /* each round: {id, date, course, ott, app, atg, putt, gross, notes} */
  },
  /* Course maps for the Plan tab. Built in the Course Editor (trace-on-image).
     Geometry stored in normalized field units (0–1000 x, 0–1400 y, portrait).
     scaleYpu = yards per field-unit (from 2-point calibration or hole yardage). */
  courses: [],
  /* Per-club observed miss tendencies (My Bag → club detail). Keyed by club id.
     {dir, curve, heelToe, lowHigh}. Will feed gear-effect + dispersion skew + D-plane. */
  missTendency: {},
  /* Skills-test history (The Chain → 1 Score → Assess). Each: {id, date, type, score, detail{}}. */
  skillsTests: [],
  /* Handicap snapshots over time (Locker Room → Myself). Each: {date, hcp}. */
  hcpHistory: [],
  /* Golfer's default targeting tendencies (Plan → Strategy). Drive the EV aim points later. */
  strategy: {
    teeTarget: 'centre',          // left-edge|left-centre|centre|right-centre|right-edge|shortest|widest
    teeClub: 'optimal',           // driver-often|optimal|conservative
    approachTarget: 'flag-centre',// left-edge|left-centre|centre|right-centre|right-edge|at-flag|flag-centre
    approachDistance: 'middle',   // pin-high|middle|fat|pin-seek
    riskPosture: 'balanced'       // balanced|chase|protect|match — the aim-optimizer's objective
  },
  /* Shots ANCHORED on the Hole Overlay: where the ball actually finished, as opposed to where
     it was aimed. anchors is keyed "<course name>|<hole number>" -> [ {x,y}|null per shot ].
     A finish is what turns modelled strokes gained into measured strokes gained, so this is
     deliberately the shape a full round record needs — one finish per shot, per hole.
     Also holds sel — the hole the overlay opens on, as {courseId, holeNum} rather than list
     indices, so importing or pruning a course cannot repoint it at a different hole. */
  play: { anchors: {}, sel: null },
  /* each course: {id, name, holes:[ {num, par, yards, scaleYpu, bg(dataURL|null),
       tee:{x,y}|null, pin:{x,y}|null, green:[{x,y}], fairway:[{x,y}],
       hazards:[{type:'sand|water|oob', pts:[{x,y}]}] } ]} */
  /* physical club specs */
  clubs: [
    {id:'D',  type:'wood',  label:'D',  make:'Callaway', model:'Rogue ST',       shaft:'HZRDUS 6.0 76g', length:'45"',    loft:'8°',  origLoft:'9°',     lie:'56°',    swt:'—',    year:2021},
    {id:'Fwy',type:'wood',  label:'F',  make:'Callaway', model:'Rogue Subzero',  shaft:'HZRDUS 6.0 76g', length:'42.5"',  loft:'15°', origLoft:'15°',    lie:'57°',    swt:'D3.5', year:2018},
    {id:'H',  type:'wood',  label:'H',  make:'Callaway', model:'Rogue',          shaft:'HZRDUS 6.0 85g', length:'40"',    loft:'19°', origLoft:'19°',    lie:'58°',    swt:'D2',   year:2018},
    {id:'U',  type:'wood',  label:'U',  make:'Callaway', model:'Apex UT',        shaft:'KBS Tour-V 110 S',length:'39"',   loft:'23°', origLoft:'21°',    lie:'60°',    swt:'D0',   year:2014},
    {id:'5i', type:'iron',  label:'5',  make:'Callaway', model:'Apex CB 2021',   shaft:'ProjX IO 5.5',   length:'38"',    loft:'27°', origLoft:'26°',    lie:'61°',    swt:'D2',   year:2021},
    {id:'6i', type:'iron',  label:'6',  make:'Callaway', model:'Apex CB 2021',   shaft:'ProjX IO 5.5',   length:'37.5"',  loft:'31°', origLoft:'29°',    lie:'61.5°',  swt:'D2',   year:2021},
    {id:'7i', type:'iron',  label:'7',  make:'Callaway', model:'Apex MB 21',     shaft:'ProjX IO 5.5',   length:'37"',    loft:'35°', origLoft:'34°',    lie:'62°',    swt:'D2',   year:2021},
    {id:'8i', type:'iron',  label:'8',  make:'Callaway', model:'Apex MB 21',     shaft:'ProjX IO 5.5',   length:'36.5"',  loft:'39°', origLoft:'38°',    lie:'62.5°',  swt:'D2',   year:2021},
    {id:'9i', type:'iron',  label:'9',  make:'Callaway', model:'Apex MB 21',     shaft:'ProjX IO 5.5',   length:'36"',    loft:'43°', origLoft:'42°',    lie:'63°',    swt:'D2',   year:2021},
    {id:'P',  type:'wedge', label:'P',  make:'Callaway', model:'JAWS MD5 S',     shaft:'DG S200',        length:'35.75"', loft:'47°', origLoft:'46° (11)',lie:'63.25°',swt:'D3',   year:2019},
    {id:'W',  type:'wedge', label:'G',  make:'Callaway', model:'JAWS MD5 S',     shaft:'DG S200',        length:'35.5"',  loft:'51°', origLoft:'50° (11)',lie:'63.5°', swt:'D3',   year:2019},
    {id:'S',  type:'wedge', label:'S',  make:'Callaway', model:'JAWS MD5 S',     shaft:'DG S200',        length:'35.25"', loft:'56°', origLoft:'54° (12)',lie:'64°',   swt:'D4',   year:2019},
    {id:'X',  type:'wedge', label:'X',  make:'Callaway', model:'MD3 PM Grind',   shaft:'ProjX 5.5',      length:'35"',    loft:'65°', origLoft:'64° (11)',lie:'64°',   swt:'D5',   year:2015},
    {id:'Pu', type:'putter',label:'Pu', make:'Odyssey',  model:'Toulon Garage Azalea', shaft:'Stroke Lab', length:'34"',  loft:'3°',  origLoft:'3°',      lie:'70°',   swt:'C3',   year:2019, grip:'Golf Pride Pistol', weightOz:'18.25'}
  ],
  /* per-golfer performance keyed by club id */
  performance: {
    D:  {carry:270,total:295,bspd:163,cspd:110,launch:11,spin:2400,ht:100,land:42},
    Fwy:{carry:235,total:250,bspd:155,cspd:103,launch:13,spin:4300,ht:90, land:41},
    H:  {carry:210,total:225,bspd:145,cspd:99, launch:15,spin:5100,ht:90, land:42},
    U:  {carry:200,total:210,bspd:135,cspd:97, launch:16,spin:5300,ht:90, land:43},
    '5i':{carry:190,total:197,bspd:130,cspd:95,launch:17,spin:5700,ht:90, land:44},
    '6i':{carry:177,total:183,bspd:125,cspd:93,launch:18,spin:6200,ht:90, land:45},
    '7i':{carry:165,total:170,bspd:120,cspd:91,launch:19,spin:6700,ht:85, land:46},
    '8i':{carry:153,total:157,bspd:115,cspd:89,launch:21,spin:7200,ht:85, land:47},
    '9i':{carry:139,total:142,bspd:110,cspd:87,launch:23,spin:7800,ht:85, land:48},
    P:  {carry:124,total:126,bspd:100,cspd:85,launch:25,spin:8500,ht:75, land:49},
    W:  {carry:110,total:108,bspd:90, cspd:83,launch:27,spin:9000,ht:75, land:49},
    S:  {carry:95, total:null,bspd:80,cspd:81,launch:29,spin:9500,ht:75, land:49},
    X:  {carry:72, total:null,bspd:69,cspd:75,launch:35,spin:10000,ht:70,land:50},
    Pu: {carry:null,total:null,bspd:null,cspd:null,launch:null,spin:null,ht:null,land:null}
  },
  /* partial swings — total distances (carry + green rollout), single source.
     Full-swing totals match performance.total; partials scaled proportionally. */
  partials: {
    '7i':{full:170,tq:158,half:143, conf:[true,false,false]},
    '8i':{full:157,tq:143,half:127, conf:[true,false,false]},
    '9i':{full:142,tq:127,half:112, conf:[true,false,false]},
    P:   {full:126,tq:112,half:97,  conf:[true,false,false]},
    W:   {full:112,tq:97, half:74,  conf:[true,false,false]},
    S:   {full:97, tq:74, half:57,  conf:[true,false,true]},
    X:   {full:74, tq:57, half:37,  conf:[true,true,true]}
  },
  /* per-club stock-shot D-plane tendencies (horizontal face/path + attack angle, degrees).
     hFace/hPath: left(−)/right(+) of target. Stock shape & curve derived (face vs path,
     loft-scaled). Seeds a mild draw bias for long clubs → neutral wedges. Edit in the
     Practice → D-Plane Tendencies grid; consumed by Bag dispersion and Plan overlays. */
  dplane: {
    D:   {hFace:0.5, hPath:1.5, vFace:13, aoa:-1.0},
    Fwy: {hFace:0.4, hPath:1.3, vFace:14, aoa:-1.5},
    H:   {hFace:0.3, hPath:1.2, vFace:17, aoa:-2.5},
    U:   {hFace:0.3, hPath:1.1, vFace:19, aoa:-3.0},
    '5i':{hFace:0.2, hPath:1.0, vFace:23, aoa:-3.5},
    '6i':{hFace:0.2, hPath:0.9, vFace:26, aoa:-4.0},
    '7i':{hFace:0.1, hPath:0.8, vFace:29, aoa:-4.5},
    '8i':{hFace:0.1, hPath:0.7, vFace:33, aoa:-5.0},
    '9i':{hFace:0.0, hPath:0.6, vFace:37, aoa:-5.5},
    P:   {hFace:0.0, hPath:0.5, vFace:42, aoa:-6.0},
    W:   {hFace:-0.1,hPath:0.4, vFace:46, aoa:-6.5},
    S:   {hFace:-0.2,hPath:0.3, vFace:50, aoa:-7.0},
    X:   {hFace:-0.3,hPath:0.2, vFace:58, aoa:-7.5}
  },
  /* swing data — causation chain, placeholder labels pending StrongerGolf terms */
  swing: {
    impact: { faceAngle:'', clubPath:'', faceToPath:'', strikeH:'', strikeV:'', dynamicLoft:'', attackAngle:'' },
    forces: {
      pull:  { transition:{direction:'',magnitude:''}, mid:{direction:'',magnitude:''}, impact:{direction:'',magnitude:''} },
      push:  { transition:{direction:'',magnitude:''}, mid:{direction:'',magnitude:''}, impact:{direction:'',magnitude:''} },
      twist: { transition:{direction:'',magnitude:''}, mid:{direction:'',magnitude:''}, impact:{direction:'',magnitude:''} }
    },
    kinematics: {
      sequenceOrder:'', peakTiming:'', speedGain:'', transitionTrigger:'',
      pelvis:{bs:'',trans:'',mid:'',imp:'',ft:''},
      thorax:{bs:'',trans:'',mid:'',imp:'',ft:''},
      arm:   {bs:'',trans:'',mid:'',imp:'',ft:''},
      club:  {bs:'',trans:'',mid:'',imp:'',ft:''}
    },
    forcePlate: {
      wtAddress:'', wtTop:'', wtImpact:'',
      loadingPattern:'', transitionTrigger:'',
      peakLeadTiming:'', peakTrailTiming:'',
      pushOffMagnitude:'', copPath:'', notes:''
    },
    tpi: {
      overheadSquat:'', pelvicTilt:'', pelvicRotation:'',
      thoracicRotation:'', hipInternal:'', hipExternal:'',
      hamstring:'', wristHinge:'', singleLegBalance:'',
      seatedTrunkRot:'', lowerQuarterRot:'', notes:''
    },
    planes: { hsp:'', vsp:'', pathTendH:'', pathTendV:'' },
    grip:   { strength:null, depth:null, notes:'' },
    psych: {
      mindtrak: { focus:'', commitment:'', emotional:'', routine:'', errors:'', recovery:'' },
      vision54: { thinkBox:'', playBox:'', humanSkills:'', bestScore:'', notes:'' },
      fearless:  { orientation:'', courage:'', identity:'', fear:'', notes:'' },
      goals:     { daily:'', weekly:'', monthly:'', season:'', career:'' }
    },
    notes: ''
  },
  /* other bags inventory — for replacement matching */
  otherClubs: [
    {label:'W', effLoft:48,make:'Callaway',model:'MacDaddy 2 S',  shaft:'DG Wedge',          length:'35.375"',bag:'Home Backups',year:2013},
    {label:'S', effLoft:53,make:'Callaway',model:'MacDaddy 2 S',  shaft:'DG Wedge',          length:'35.375"',bag:'Home Backups',year:2013},
    {label:'3w',effLoft:15,make:'Callaway',model:'Epic Sub Zero', shaft:'HZRDUS 6.0 75g',    length:'43"',    bag:'Home Backups',year:2016},
    {label:'4', effLoft:24,make:'Callaway',model:'Apex Pro',      shaft:'ProjX 5.5',         length:'38.5"',  bag:'Home Backups',year:2016},
    {label:'5', effLoft:28,make:'Callaway',model:'Apex Pro',      shaft:'ProjX 5.5',         length:'38"',    bag:'Home Backups',year:2016},
    {label:'P', effLoft:47,make:'Callaway',model:'Apex Pro',      shaft:'ProjX 5.5',         length:'35.75"', bag:'Home Backups',year:2016},
    {label:'G', effLoft:51,make:'Callaway',model:'MD3 S',         shaft:'DG Wedge',          length:'35.5"',  bag:'Home Backups',year:2015},
    {label:'G', effLoft:52,make:'Callaway',model:'MD4 Tactical',  shaft:'DG S200',           length:'35.5"',  bag:'Home Backups',year:2018},
    {label:'A', effLoft:52,make:'Callaway',model:'Apex Pro',      shaft:'ProjX 5.5',         length:'35.5"',  bag:'Home Backups',year:2016},
    {label:'S', effLoft:57,make:'Callaway',model:'MD3 PM',        shaft:'KBS Tour V-wedge',  length:'35.25"', bag:'Home Backups',year:2015},
    {label:'3', effLoft:20,make:'Callaway',model:'Apex',         shaft:'ProjX 5.5',         length:'39"',    bag:'Home Backups',year:2019},
    {label:'4', effLoft:23,make:'Callaway',model:'Apex CB 2021', shaft:'ProjX IO 5.5',      length:'38.5"',  bag:'Home Backups',year:2021},
    {label:'S', effLoft:55,make:'Callaway',model:'MD3 S',         shaft:'DG Wedge',          length:'35.25"', bag:'Home Backups',year:2015},
    {label:'S', effLoft:56,make:'Callaway',model:'MD4 Tactical',  shaft:'DG S200',           length:'35.25"', bag:'Home Backups',year:2018},
    {label:'L', effLoft:59,make:'Callaway',model:'MD3 PM',        shaft:'KBS Tour V-wedge',  length:'35"',    bag:'Home Backups',year:2015},
    {label:'L', effLoft:61,make:'Callaway',model:'MD3 PM',        shaft:'KBS Tour V-wedge',  length:'35"',    bag:'Home Backups',year:2015},
    {label:'L', effLoft:62,make:'Callaway',model:'MD4 Tactical',  shaft:'DG S200',           length:'35"',    bag:'Home Backups',year:2018},
    {label:'Fwy',effLoft:15,make:'Callaway',model:'XHot Pro',     shaft:'ProjX 6.0',         length:'43.5"',  bag:'Home Staff Bag',year:2013},
    {label:'2', effLoft:19,make:'Hogan',   model:'Apex Edge Pro', shaft:'Apex 4',            length:'39.25"', bag:'Home Staff Bag',year:2002},
    {label:'4', effLoft:23,make:'Callaway',model:'Apex',          shaft:'ProjX 6.0 Pxi',     length:'38.5"',  bag:'Home Staff Bag',year:2014},
    {label:'5', effLoft:27,make:'Callaway',model:'Apex MB',       shaft:'ProjX 5.5',         length:'38"',    bag:'Home Staff Bag',year:2018},
    {label:'6', effLoft:31,make:'Callaway',model:'Apex MB',       shaft:'ProjX 5.5',         length:'37.5"',  bag:'Home Staff Bag',year:2018},
    {label:'7', effLoft:35,make:'Callaway',model:'Apex MB',       shaft:'ProjX 5.5',         length:'37"',    bag:'Home Staff Bag',year:2018},
    {label:'8', effLoft:39,make:'Callaway',model:'Apex MB',       shaft:'ProjX 5.5',         length:'36.5"',  bag:'Home Staff Bag',year:2018},
    {label:'9', effLoft:43,make:'Callaway',model:'Apex MB',       shaft:'ProjX 5.5',         length:'36"',    bag:'Home Staff Bag',year:2018},
    {label:'P', effLoft:48,make:'Callaway',model:'Apex MB',       shaft:'ProjX 5.5',         length:'35.75"', bag:'Home Staff Bag',year:2018},
    {label:'G', effLoft:53,make:'Callaway',model:'MD3 S',         shaft:'DG Wedge',          length:'35.5"',  bag:'Home Staff Bag',year:2015},
    {label:'S', effLoft:57,make:'Callaway',model:'MD3 S',         shaft:'DG Wedge',          length:'35.25"', bag:'Home Staff Bag',year:2015},
    {label:'L', effLoft:61,make:'Callaway',model:'MD3 S',         shaft:'DG Wedge',          length:'35"',    bag:'Home Staff Bag',year:2015},
    {label:'Fwy',effLoft:15,make:'Cleveland',model:'Launcher',    shaft:'ProLaunch Blue 70 S',length:'43"',   bag:'Patio Staff Bag',year:2006},
    {label:'H', effLoft:20,make:'Adams',   model:'Mini Pro',      shaft:'Aldila Tour Green S',length:'40"',   bag:'Patio Staff Bag',year:2014},
    {label:'4', effLoft:24,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'38.5"',  bag:'Patio Staff Bag',year:2005},
    {label:'5', effLoft:28,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'38"',    bag:'Patio Staff Bag',year:2005},
    {label:'6', effLoft:32,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'37.5"',  bag:'Patio Staff Bag',year:2005},
    {label:'7', effLoft:36,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'37"',    bag:'Patio Staff Bag',year:2005},
    {label:'8', effLoft:40,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'36.5"',  bag:'Patio Staff Bag',year:2005},
    {label:'9', effLoft:44,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'36"',    bag:'Patio Staff Bag',year:2005},
    {label:'P', effLoft:48,make:'Cleveland',model:'CG2',          shaft:'DG S300',           length:'35.75"', bag:'Patio Staff Bag',year:2005},
    {label:'S', effLoft:54,make:'Cleveland',model:'588 DSG Raw',  shaft:'DG Wedge',          length:'35.5"',  bag:'Patio Staff Bag',year:2006},
    {label:'L', effLoft:58,make:'Cleveland',model:'588 DSG Chr',  shaft:'DG Wedge',          length:'35.5"',  bag:'Patio Staff Bag',year:2006},
    {label:'X', effLoft:64,make:'Cleveland',model:'588 Chrome',   shaft:'DG Wedge',          length:'35"',    bag:'Patio Staff Bag',year:2005},
    {label:'Fwy',effLoft:15,make:'Callaway',model:'BB Alpha816',  shaft:'Fubuki z65 x5ct',   length:'42.5"',  bag:'Office Staff Bag',year:2016},
    {label:'H', effLoft:18,make:'Callaway',model:'BB Alpha815',   shaft:'Fubuki h400ct',     length:'40"',    bag:'Office Staff Bag',year:2015},
    {label:'U', effLoft:22,make:'Callaway',model:'Apex UT',       shaft:'KBS Tour-V 110 S',  length:'39"',    bag:'Office Staff Bag',year:2014},
    {label:'4', effLoft:25,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'38.5"',  bag:'Office Staff Bag',year:2009},
    {label:'5', effLoft:28,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'38"',    bag:'Office Staff Bag',year:2009},
    {label:'6', effLoft:32,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'37.5"',  bag:'Office Staff Bag',year:2009},
    {label:'7', effLoft:36,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'37"',    bag:'Office Staff Bag',year:2009},
    {label:'8', effLoft:40,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'36.5"',  bag:'Office Staff Bag',year:2009},
    {label:'9', effLoft:44,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'36"',    bag:'Office Staff Bag',year:2009},
    {label:'P', effLoft:48,make:'Callaway',model:'X-Forged',      shaft:'ProjX 6.0 Fltd',    length:'35.5"',  bag:'Office Staff Bag',year:2009},
    {label:'S', effLoft:53,make:'Callaway',model:'X Forged Raw',  shaft:'Callaway Wedge',    length:'35.75"', bag:'Office Staff Bag',year:2008},
    {label:'L', effLoft:59,make:'Callaway',model:'MacDaddy 2 U',  shaft:'DG Wedge',          length:'35.25"', bag:'Office Staff Bag',year:2013},
    /* Putters */
    {label:'Pu',effLoft:3, make:'Odyssey',      model:'Black Tour Design 8',           shaft:'Steel Putter', length:'34.5"',lie:'70°',swt:'D4.5',weightOz:'17.5', grip:'Odyssey Winn',        bag:'Office Rack 1',  year:2010, type:'putter'},
    {label:'Pu',effLoft:3, make:'Odyssey',      model:'PT 82 ProType',                 shaft:'Steel Putter', length:'34"',  lie:'70°',swt:'D0',  weightOz:'17.75',grip:'SuperStroke 1.0',     bag:'Office Rack 1',  year:2010, type:'putter'},
    {label:'Pu',effLoft:3, make:'Odyssey',      model:'White Hot #8',                  shaft:'Steel Putter', length:'33.5"',lie:'70°',swt:'C2',  weightOz:'17.5', grip:'Odyssey Lamkin',      bag:'Office Rack 1',  year:2000, type:'putter'},
    {label:'Pu',effLoft:4, make:'Wilson',       model:'Arnold Palmer "The Original"',  shaft:'Steel Putter', length:'34"',  lie:'70°',swt:'D1',  weightOz:'16.5', grip:'Golf Pride Pistol',   bag:'Office Rack 1',  year:1973, type:'putter'},
    {label:'Pu',effLoft:4, make:'Scotty Cameron',model:'Inspired by Brad Faxon — Oil Can',shaft:'Steel Putter',length:'35"',lie:'71°',swt:'D2', weightOz:'18',   grip:'Leather stitchback',  bag:'Office Rack 2',  year:2001, type:'putter'},
    {label:'Pu',effLoft:4, make:'Scotty Cameron',model:'Inspired by Brad Faxon — Pro Platinum',shaft:'Steel Putter',length:'35"',lie:'71°',swt:'D2',weightOz:'18',grip:'Leather stitchback',  bag:'Office Rack 2',  year:2002, type:'putter'},
    {label:'Pu',effLoft:4, make:'Scotty Cameron',model:'Laguna 2.5 Tour',              shaft:'Steel Putter', length:'35"',  lie:'71°',swt:'D2',  weightOz:'18',   grip:'Leather stitchback',  bag:'Office Rack 2',  year:2000, type:'putter'},
    {label:'Pu',effLoft:4, make:'Scotty Cameron',model:'Laguna MidSlant Prototype',    shaft:'Steel Putter', length:'35"',  lie:'71°',swt:'D2',  weightOz:'18',   grip:'Leather stitchback',  bag:'Office Rack 2',  year:2000, type:'putter'},
    {label:'Pu',effLoft:3, make:'Odyssey',      model:'ProType Tour 2',                shaft:'Steel Putter', length:'33.5"',lie:'70°',swt:'D5',  weightOz:'18.75',grip:'Pure Pistol',          bag:'Office Staff Bag',year:2013, type:'putter'}
  ]
};



// Expose top-level declarations on window so inline handlers and
// other modules can resolve them during the staged ES-module migration.
Object.assign(window, { DEFAULT_DATA });
