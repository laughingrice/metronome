const { useState, useEffect, useRef } = React;

const MetronomeUI = () => {
    // --- Configuration ---
    const MIN_BPM = 30;
    const MAX_BPM = 250;
    
    // --- Initial Data ---
    const DEFAULT_PRESET = {
        id: 'default',
        name: 'Default (4/4)',
        bpm: 120,
        beatsPerCycle: 4,
        grid: { 'high-0': true, 'low-0': true, 'mid-2': true }
    };

    // --- State ---
    const [bpm, setBpm] = useState(120);
    const [isPlaying, setIsPlaying] = useState(false);
    const [beatsPerCycle, setBeatsPerCycle] = useState(4);
    const [currentStep, setCurrentStep] = useState(-1); // For visualizer
    const [isDragging, setIsDragging] = useState(false);
    
    // Presets State
    const [presets, setPresets] = useState([DEFAULT_PRESET]);
    const [selectedPresetId, setSelectedPresetId] = useState('default');
    
    // Grid State
    const [grid, setGrid] = useState(DEFAULT_PRESET.grid);

    // Refs
    const lastMousePos = useRef({ x: 0, y: 0 });
    const audioCtxRef = useRef(null);
    const nextNoteTimeRef = useRef(0);
    const timerIDRef = useRef(null);
    const stepRef = useRef(0); // Mutable ref to track step inside audio loop
    const fileInputRef = useRef(null); // For importing JSON

    // --- Audio Engine (Synthesizer) ---
    const initAudio = () => {
        if (!audioCtxRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
    };

    const playSound = (type, time) => {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'kick') {
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
            osc.start(time);
            osc.stop(time + 0.5);
        } else if (type === 'snare') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(100, time);
            gain.gain.setValueAtTime(0.7, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            osc.start(time);
            osc.stop(time + 0.2);
        } else if (type === 'hat') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, time);
            // Quick decay for a "tick" sound
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
            osc.start(time);
            osc.stop(time + 0.05);
        }
    };

    // --- Scheduler (Lookahead) ---
    const scheduleNote = (stepNumber, time) => {
        // 1. Play Audio
        if (grid[`high-${stepNumber}`]) playSound('hat', time);
        if (grid[`mid-${stepNumber}`]) playSound('snare', time);
        if (grid[`low-${stepNumber}`]) playSound('kick', time);

        // 2. Schedule Visual Update (using setTimeout to sync with audio time)
        // We use a separate drawing loop logic or just simple timeout synchronization
        const visualDelay = (time - audioCtxRef.current.currentTime) * 1000;
        setTimeout(() => {
            setCurrentStep(stepNumber);
        }, Math.max(0, visualDelay));
    };

    const scheduler = () => {
        // While there are notes that will need to play before the next interval, schedule them
        const secondsPerBeat = 60.0 / bpm;
        const lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
        const scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)

        while (nextNoteTimeRef.current < audioCtxRef.current.currentTime + scheduleAheadTime) {
            scheduleNote(stepRef.current, nextNoteTimeRef.current);
            
            // Advance time and step
            nextNoteTimeRef.current += secondsPerBeat;
            stepRef.current = (stepRef.current + 1) % beatsPerCycle;
        }
        timerIDRef.current = setTimeout(scheduler, lookahead);
    };

    // --- Play/Stop Logic ---
    useEffect(() => {
        if (isPlaying) {
            initAudio();
            stepRef.current = 0;
            setCurrentStep(0);
            nextNoteTimeRef.current = audioCtxRef.current.currentTime;
            scheduler();
        } else {
            clearTimeout(timerIDRef.current);
            setCurrentStep(-1);
        }
        return () => clearTimeout(timerIDRef.current);
    }, [isPlaying]);

    // Update scheduler if BPM changes while playing? 
    // The lookahead function uses current BPM state automatically on next loop.

    // --- Preset & File Logic ---

    // Load Preset
    const handlePresetChange = (e) => {
        const id = e.target.value;
        const preset = presets.find(p => p.id === id);
        if (preset) {
            setSelectedPresetId(id);
            setBpm(preset.bpm);
            setBeatsPerCycle(preset.beatsPerCycle);
            setGrid(preset.grid);
            setIsPlaying(false); // Stop when changing presets
        }
    };

    // Store (+)
    const handleSavePreset = () => {
        const name = prompt("Enter preset name:", "My Cool Beat");
        if (!name) return;
        
        const newPreset = {
            id: Date.now().toString(), // Simple unique ID
            name: name,
            bpm: bpm,
            beatsPerCycle: beatsPerCycle,
            grid: { ...grid } // Deep copy grid
        };

        setPresets([...presets, newPreset]);
        setSelectedPresetId(newPreset.id);
    };

    // Delete (Trash)
    const handleDeletePreset = () => {
        if (presets.length <= 1) {
            alert("Cannot delete the last preset.");
            return;
        }
        if (confirm("Delete this preset?")) {
            const newPresets = presets.filter(p => p.id !== selectedPresetId);
            setPresets(newPresets);
            // Load the first available one
            const next = newPresets[0];
            setSelectedPresetId(next.id);
            setBpm(next.bpm);
            setBeatsPerCycle(next.beatsPerCycle);
            setGrid(next.grid);
        }
    };

    // Export (Disk In)
    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "metronome_presets.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // Import (Disk Out) Trigger
    const triggerImport = () => {
        fileInputRef.current.click();
    };

    // Handle File Read
    const handleFileImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const loadedPresets = JSON.parse(event.target.result);
                if (Array.isArray(loadedPresets) && loadedPresets.length > 0) {
                    setPresets(loadedPresets);
                    // Load first one
                    const first = loadedPresets[0];
                    setSelectedPresetId(first.id);
                    setBpm(first.bpm);
                    setBeatsPerCycle(first.beatsPerCycle);
                    setGrid(first.grid);
                } else {
                    alert("Invalid JSON format");
                }
            } catch (err) {
                alert("Error reading file");
            }
        };
        reader.readAsText(file);
    };


    // --- Interaction Logic (Dial) ---
    const updateBpmFromDelta = (clientX, clientY) => {
        const deltaX = clientX - lastMousePos.current.x;
        const deltaY = clientY - lastMousePos.current.y;
        const sensitivity = 0.5; 
        const change = (deltaX - deltaY) * sensitivity;

        setBpm(prev => {
            const currentVal = (prev === '' || isNaN(prev)) ? MIN_BPM : prev;
            let newVal = currentVal + change;
            if (newVal < MIN_BPM) newVal = MIN_BPM;
            if (newVal > MAX_BPM) newVal = MAX_BPM;
            return Math.round(newVal);
        });

        lastMousePos.current = { x: clientX, y: clientY };
    };

    const handleMouseDown = (e) => {
        setIsDragging(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouchStart = (e) => {
        setIsDragging(true);
        lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) updateBpmFromDelta(e.clientX, e.clientY);
        };
        const handleMouseUp = () => {
            setIsDragging(false);
        };
        const handleTouchMove = (e) => {
            if (isDragging) {
                e.preventDefault(); 
                updateBpmFromDelta(e.touches[0].clientX, e.touches[0].clientY);
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging]);

    const toggleGridParams = (row, col) => {
        const key = `${row}-${col}`;
        setGrid(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleBpmChange = (e) => {
        const valStr = e.target.value;
        if (valStr === '') { setBpm(''); return; }
        let val = parseInt(valStr);
        if (isNaN(val)) return;
        if (val > MAX_BPM) val = MAX_BPM;
        setBpm(val);
    };

    const handleBpmBlur = () => {
        let val = bpm;
        if (val === '' || isNaN(val) || val < MIN_BPM) setBpm(MIN_BPM);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') e.target.blur();
    };

    const getRotation = () => {
        const currentBpm = (bpm === '' || isNaN(bpm)) ? MIN_BPM : bpm;
        const safeBpm = Math.min(Math.max(currentBpm, MIN_BPM), MAX_BPM);
        const percent = (safeBpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
        return -150 + (percent * 300); 
    };

    // --- Icons ---
    const IconStore = () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    );
    const IconTrash = () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    );
    const IconExport = () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline><line x1="23" y1="12" x2="17" y2="12" stroke="#03DAC6" strokeWidth="3"></line><polyline points="19 10 17 12 19 14" stroke="#03DAC6" strokeWidth="3"></polyline></svg>
    );
    const IconImport = () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline><line x1="17" y1="12" x2="23" y2="12" stroke="#BB86FC" strokeWidth="3"></line><polyline points="21 10 23 12 21 14" stroke="#BB86FC" strokeWidth="3"></polyline></svg>
    );

    // --- Styles ---
    const styles = {
        container: {
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px',
            boxSizing: 'border-box'
        },
        header: {
            width: '100%',
            maxWidth: '500px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px',
            borderBottom: '1px solid #333',
            paddingBottom: '15px'
        },
        buttonGhost: {
            background: 'transparent',
            border: '1px solid #444',
            color: '#aaa',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            cursor: 'pointer',
            marginLeft: '8px',
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'background 0.2s, border-color 0.2s',
        },
        select: {
            background: '#1E1E1E',
            color: '#fff',
            border: '1px solid #333',
            padding: '8px',
            borderRadius: '6px',
            minWidth: '140px',
            maxWidth: '200px',
            outline: 'none',
        },
        dialWrapper: {
            position: 'relative',
            width: '280px',
            height: '280px',
            marginBottom: '30px',
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none', 
        },
        dialTrack: {
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `conic-gradient(from 180deg at 50% 50%, 
                #121212 0deg, 
                #121212 30deg, 
                #333 30deg, 
                #333 330deg, 
                #121212 330deg)`,
            position: 'absolute',
            boxShadow: 'inset 0 0 20px #000, 0 10px 30px rgba(0,0,0,0.5)',
        },
        knobRotator: {
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            transform: `rotate(${getRotation()}deg)`,
            pointerEvents: 'none', 
            transition: isDragging ? 'none' : 'transform 0.1s cubic-bezier(0.1, 0.7, 1.0, 0.1)',
        },
        knobHandle: {
            position: 'absolute',
            top: '20px', 
            left: '50%',
            transform: 'translateX(-50%)',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: isDragging ? '#fff' : '#BB86FC',
            boxShadow: isDragging ? '0 0 20px #fff' : '0 0 15px #BB86FC',
            zIndex: 10,
            transition: 'background 0.2s, box-shadow 0.2s'
        },
        centerDisplay: {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 20,
        },
        bpmInput: {
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '4rem',
            fontWeight: '700',
            textAlign: 'center',
            width: '180px',
            outline: 'none',
            fontFamily: 'monospace',
            pointerEvents: 'auto', 
            textShadow: '0 4px 10px rgba(0,0,0,0.5)',
            userSelect: 'none',
        },
        bpmLabel: {
            color: '#BB86FC',
            fontSize: '1rem',
            letterSpacing: '3px',
            fontWeight: 'bold',
            marginTop: '-10px',
            opacity: 0.8
        },
        controlsRow: { display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' },
        tapBtn: { width: '60px', height: '60px', borderRadius: '50%', background: '#2C2C2C', border: '1px solid #444', color: '#ccc', cursor: 'pointer', fontWeight: 'bold' },
        playBtn: { 
            width: '90px', height: '90px', borderRadius: '24px', 
            background: isPlaying ? '#CF6679' : '#03DAC6', 
            border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
            boxShadow: isPlaying ? '0 0 25px rgba(207, 102, 121, 0.4)' : '0 0 25px rgba(3, 218, 198, 0.4)',
            transition: 'all 0.2s'
        },
        spinBoxContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1E1E1E', borderRadius: '12px', border: '1px solid #333', width: '60px', height: '80px' },
        spinBtn: { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.8rem', padding: '5px', width: '100%' },
        spinValue: { fontSize: '1.4rem', fontWeight: 'bold', color: '#E0E0E0' },
        sequencerLabel: { width: '100%', maxWidth: '500px', textAlign: 'left', color: '#666', fontSize: '0.8rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' },
        sequencerContainer: { display: 'grid', gridTemplateColumns: `60px repeat(${beatsPerCycle}, 1fr)`, gap: '8px', maxWidth: '500px', width: '100%', background: '#181818', padding: '20px', borderRadius: '16px', border: '1px solid #222' },
        rowLabel: { display: 'flex', alignItems: 'center', color: '#888', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px' },
        beatBox: (active, color, isCurrentStep) => ({
            height: '45px', 
            background: isCurrentStep ? '#444' : (active ? color : '#252525'), 
            borderRadius: '4px', cursor: 'pointer',
            border: active ? `1px solid ${color}` : (isCurrentStep ? '1px solid #666' : '1px solid #333'),
            boxShadow: active ? `0 0 10px ${color}66` : 'none',
            transition: 'background 0.05s', // fast transition for playhead
            opacity: isCurrentStep && !active ? 0.5 : 1
        }),
    };

    return (
        <div style={styles.container}>
            {/* Hidden Input for Import */}
            <input 
                type="file" 
                accept=".json" 
                ref={fileInputRef} 
                style={{display: 'none'}} 
                onChange={handleFileImport}
            />

            {/* Header */}
            <header style={styles.header}>
                <select style={styles.select} value={selectedPresetId} onChange={handlePresetChange}>
                    {presets.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <div style={{display: 'flex'}}>
                    {/* Store (Add) */}
                    <button style={styles.buttonGhost} title="Store Preset" onClick={handleSavePreset}>
                        <IconStore />
                    </button>
                    {/* Delete (Trash) */}
                    <button style={styles.buttonGhost} title="Delete Preset" onClick={handleDeletePreset}>
                        <IconTrash />
                    </button>
                    {/* Export (Arrow Left to Disk) */}
                    <button style={styles.buttonGhost} title="Export to File" onClick={handleExport}>
                        <IconExport />
                    </button>
                    {/* Import (Arrow Right out of Disk) */}
                    <button style={styles.buttonGhost} title="Import from File" onClick={triggerImport}>
                        <IconImport />
                    </button>
                </div>
            </header>

            {/* Interactive Dial */}
            <div 
                style={styles.dialWrapper} 
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                <div style={styles.dialTrack}></div>
                <div style={styles.knobRotator}>
                    <div style={styles.knobHandle}></div>
                </div>
                <div style={styles.centerDisplay}>
                    <input 
                        type="number" 
                        value={bpm} 
                        onChange={handleBpmChange}
                        onBlur={handleBpmBlur}
                        onKeyDown={handleKeyDown}
                        style={styles.bpmInput}
                    />
                    <span style={styles.bpmLabel}>BPM</span>
                </div>
            </div>

            {/* Controls */}
            <div style={styles.controlsRow}>
                <button style={styles.tapBtn}>TAP</button>
                
                <button style={styles.playBtn} onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? (
                        <div style={{width: 20, height: 20, background: '#121212'}}></div>
                    ) : (
                        <div style={{width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderLeft: '20px solid #121212'}}></div>
                    )}
                </button>

                <div style={styles.spinBoxContainer}>
                    <button style={styles.spinBtn} onClick={() => setBeatsPerCycle(prev => Math.min(prev + 1, 16))}>▲</button>
                    <div style={styles.spinValue}>{beatsPerCycle}</div>
                    <button style={styles.spinBtn} onClick={() => setBeatsPerCycle(prev => Math.max(prev - 1, 1))}>▼</button>
                </div>
            </div>

            {/* Sequencer Grid */}
            <div style={styles.sequencerLabel}>Rhythm Pattern</div>
            <div style={styles.sequencerContainer}>
                <div style={styles.rowLabel}>HI-HAT</div>
                {[...Array(beatsPerCycle)].map((_, i) => (
                    <div 
                        key={`high-${i}`} 
                        style={styles.beatBox(grid[`high-${i}`], '#FFFFFF', currentStep === i)} 
                        onClick={() => toggleGridParams('high', i)}
                    />
                ))}

                <div style={styles.rowLabel}>SNARE</div>
                {[...Array(beatsPerCycle)].map((_, i) => (
                    <div 
                        key={`mid-${i}`} 
                        style={styles.beatBox(grid[`mid-${i}`], '#03DAC6', currentStep === i)} 
                        onClick={() => toggleGridParams('mid', i)}
                    />
                ))}

                <div style={styles.rowLabel}>KICK</div>
                {[...Array(beatsPerCycle)].map((_, i) => (
                    <div 
                        key={`low-${i}`} 
                        style={styles.beatBox(grid[`low-${i}`], '#BB86FC', currentStep === i)} 
                        onClick={() => toggleGridParams('low', i)}
                    />
                ))}
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<MetronomeUI />);