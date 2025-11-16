
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { SCA_SENSORY_ATTRIBUTES, SCA_CUP_ATTRIBUTES, User, JudgeScore } from '../../types';
import { CheckCircle, Save } from 'lucide-react';

interface ScoreInput {
    value: string;
    error: string | null;
}

const validateScore = (value: string): { formattedValue: string, error: string | null } => {
    if (value.trim() === '') return { formattedValue: value, error: "Required." };
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return { formattedValue: value, error: "Invalid number." };
    if (numValue < 6 || numValue > 10) return { formattedValue: value, error: "Must be 6-10." };
    return { formattedValue: numValue.toFixed(2), error: null };
};

const initialSensoryScores = SCA_SENSORY_ATTRIBUTES.reduce((acc, attr) => {
    acc[attr] = { value: '', error: null };
    return acc;
}, {} as Record<string, ScoreInput>);

const initialCupScores = SCA_CUP_ATTRIBUTES.reduce((acc, attr) => {
    acc[attr] = 5; // All 5 cups are good by default
    return acc;
}, {} as Record<string, number>);


const CupperScoringSheet: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const { data, setData } = useDataContext();
    const [selectedSessionId, setSelectedSessionId] = useState<string>('');
    const [selectedSampleId, setSelectedSampleId] = useState<string>('');
    
    // Form state
    const [sensoryScores, setSensoryScores] = useState<Record<string, ScoreInput>>(initialSensoryScores);
    const [cupScores, setCupScores] = useState<Record<string, number>>(initialCupScores);
    const [defects, setDefects] = useState({ numCups: '0', intensity: 2 });
    const [notes, setNotes] = useState('');
    const [isFormTouched, setIsFormTouched] = useState(false);

    const selectedSession = useMemo(() => data.cuppingSessions.find(s => s.id === selectedSessionId), [selectedSessionId, data.cuppingSessions]);

    const hasAlreadyScored = useMemo(() => {
        if (!selectedSession || !selectedSampleId) return false;
        return (selectedSession.scores[selectedSampleId] || []).some(s => s.judgeId === currentUser.id);
    }, [selectedSampleId, selectedSession, currentUser.id]);

    const resetForm = useCallback(() => {
        setSensoryScores(initialSensoryScores);
        setCupScores(initialCupScores);
        setDefects({ numCups: '0', intensity: 2 });
        setNotes('');
        setIsFormTouched(false);
    }, []);

    useEffect(() => {
        setSelectedSampleId('');
        resetForm();
    }, [selectedSessionId, resetForm]);
    
    useEffect(() => {
        resetForm();
    }, [selectedSampleId, resetForm]);

    const handleSensoryChange = (attr: string, value: string) => {
        setIsFormTouched(true);
        setSensoryScores(prev => ({ ...prev, [attr]: { value, error: null } }));
    };

    const handleSensoryBlur = (attr: string) => {
        const result = validateScore(sensoryScores[attr].value);
        setSensoryScores(prev => ({
            ...prev,
            [attr]: { value: result.error ? prev[attr].value : result.formattedValue, error: result.error }
        }));
    };
    
    const handleCupChange = (attr: string, cupIndex: number) => {
        setIsFormTouched(true);
        setCupScores(prev => ({...prev, [attr]: cupIndex + 1 }));
    };
    
    const handleDefectChange = (field: 'numCups' | 'intensity', value: string | number) => {
        setIsFormTouched(true);
        setDefects(prev => ({...prev, [field]: value}));
    };

    const calculations = useMemo(() => {
        const sensoryTotal = SCA_SENSORY_ATTRIBUTES.reduce((sum, attr) => {
            const numValue = parseFloat(sensoryScores[attr].value);
            return sum + (isNaN(numValue) ? 0 : numValue);
        }, 0);
        
        const cupsTotal = SCA_CUP_ATTRIBUTES.reduce((sum, attr) => sum + (cupScores[attr] * 2), 0);
        
        const subtotal = sensoryTotal + cupsTotal;
        
        const defectCups = parseInt(defects.numCups, 10);
        const defectsTotal = (isNaN(defectCups) || defectCups < 0) ? 0 : defectCups * defects.intensity;
        
        const finalScore = subtotal - defectsTotal;

        return { subtotal, defectsTotal, finalScore };
    }, [sensoryScores, cupScores, defects]);
    
    const validateAllFields = useCallback(() => {
        let isValid = true;
        const tempSensoryScores = { ...sensoryScores };

        for (const attr of SCA_SENSORY_ATTRIBUTES) {
            const result = validateScore(tempSensoryScores[attr].value);
            tempSensoryScores[attr] = { ...tempSensoryScores[attr], error: result.error };
            if (result.error) isValid = false;
        }
        
        const defectCups = parseInt(defects.numCups, 10);
        if (isNaN(defectCups) || defectCups < 0) isValid = false;

        setSensoryScores(tempSensoryScores);
        return isValid;
    }, [sensoryScores, defects.numCups]);

    const isSaveDisabled = useMemo(() => {
        if (!isFormTouched) return true;
        for(const attr of SCA_SENSORY_ATTRIBUTES) {
            if (validateScore(sensoryScores[attr].value).error) return true;
        }
        const defectCups = parseInt(defects.numCups, 10);
        if(isNaN(defectCups) || defectCups < 0) return true;
        
        return false;
    }, [sensoryScores, defects.numCups, isFormTouched]);

    const handleSaveScore = () => {
        if (!validateAllFields() || hasAlreadyScored || !selectedSession) return;
        
        const scoresToSave: { [attribute: string]: number } = {};
        SCA_SENSORY_ATTRIBUTES.forEach(attr => {
            scoresToSave[attr] = parseFloat(sensoryScores[attr].value);
        });
        SCA_CUP_ATTRIBUTES.forEach(attr => {
            scoresToSave[attr] = cupScores[attr] * 2;
        });

        const newScore: JudgeScore = {
            judgeId: currentUser.id, judgeName: currentUser.name,
            scores: scoresToSave, notes, totalScore: calculations.finalScore,
        };

        setData(prevData => {
            const updatedSessions = prevData.cuppingSessions.map(session => {
                if (session.id !== selectedSession.id) return session;
                const updatedScores = [ ...(session.scores[selectedSampleId] || []), newScore ];
                return { ...session, scores: { ...session.scores, [selectedSampleId]: updatedScores } };
            });
            return { ...prevData, cuppingSessions: updatedSessions };
        });
    };

    const renderSensoryInput = (attr: string) => {
        const { value, error } = sensoryScores[attr];
        return (<div key={attr} className="mb-2">
            <label htmlFor={attr} className="block text-sm font-medium text-gray-700 mb-1">{attr}</label>
            <input type="number" id={attr} min="6" max="10" step="0.25" value={value}
                onChange={e => handleSensoryChange(attr, e.target.value)}
                onBlur={() => handleSensoryBlur(attr)}
                className={`w-full p-2 border rounded-md shadow-sm text-sm text-center ${error ? 'border-red-500' : 'border-gray-300'}`}
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>);
    };

    const renderCupInput = (attr: string) => {
        const count = cupScores[attr];
        return (<div key={attr} className="mb-4">
            <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">{attr}</label>
                <span className="text-lg font-bold text-gray-800">{count * 2}</span>
            </div>
            <div className="flex items-center gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <button type="button" key={i} onClick={() => handleCupChange(attr, i)}
                        className={`flex-1 h-8 rounded-md border-2 transition-colors ${i < count ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-400 hover:border-indigo-500'}`} />
                ))}
            </div>
        </div>);
    };
    
    return (
        <div>
             <h1 className="text-3xl font-bold text-gray-900 mb-2">SCA Cupping Form</h1>
             <p className="text-gray-600 mb-6">Select a session and sample to begin scoring.</p>

             <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">1. Select Cupping Session</label>
                        <select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3">
                            <option value="" disabled>Choose a session...</option>
                            {data.cuppingSessions.map(session => (<option key={session.id} value={session.id}>{session.name}</option>))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">2. Select Sample to Score</label>
                        <select value={selectedSampleId} onChange={(e) => setSelectedSampleId(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3" disabled={!selectedSession}>
                            <option value="" disabled>Choose a sample...</option>
                            {selectedSession?.samples.map(sample => (<option key={sample.id} value={sample.id}>Blind Code: {sample.blindCode}</option>))}
                        </select>
                    </div>
                </div>
                
                {!selectedSampleId ? (
                     <div className="text-center bg-gray-50 p-8 rounded-lg"><h3 className="text-xl font-bold text-gray-800">Ready to Score</h3><p className="mt-1 text-gray-600">Please select a session and sample.</p></div>
                ) : hasAlreadyScored ? (
                    <div className="text-center bg-green-50 p-8 rounded-lg"><CheckCircle className="h-12 w-12 text-green-500 mx-auto" /><h3 className="mt-4 text-xl font-bold text-gray-800">Score Submitted</h3><p className="mt-1 text-gray-600">Your score for this sample has been recorded.</p></div>
                ) : (
                    <div className="mt-6 border-t pt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Left Column: Sensory */}
                            <div>{SCA_SENSORY_ATTRIBUTES.map(renderSensoryInput)}</div>
                            {/* Right Column: Cups, Defects, Summary */}
                            <div>
                                {SCA_CUP_ATTRIBUTES.map(renderCupInput)}
                                {/* Defects Section */}
                                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                                    <label className="text-sm font-medium text-gray-700">Defects (subtract)</label>
                                    <div className="flex items-center gap-4 mt-2">
                                        <div><label className="text-xs"># of cups</label><input type="number" min="0" value={defects.numCups} onChange={e => handleDefectChange('numCups', e.target.value)} className="w-20 p-2 border rounded-md shadow-sm text-sm"/></div>
                                        <span>&times;</span>
                                        <div className="flex gap-2"><label className="flex items-center text-sm gap-1"><input type="radio" name="intensity" value="2" checked={defects.intensity === 2} onChange={e => handleDefectChange('intensity', 2)}/> Taint</label><label className="flex items-center text-sm gap-1"><input type="radio" name="intensity" value="4" checked={defects.intensity === 4} onChange={e => handleDefectChange('intensity', 4)}/> Fault</label></div>
                                        <span>=</span>
                                        <span className="text-2xl font-bold text-red-600">{calculations.defectsTotal}</span>
                                    </div>
                                </div>
                                {/* Final Score Section */}
                                <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-2">
                                    <div className="flex justify-between items-baseline"><span className="font-semibold text-gray-600">Subtotal</span><span className="font-bold text-xl text-gray-800">{calculations.subtotal.toFixed(2)}</span></div>
                                    <div className="flex justify-between items-baseline"><span className="font-semibold text-red-600">Defects</span><span className="font-bold text-xl text-red-600">&minus; {calculations.defectsTotal.toFixed(2)}</span></div>
                                    <hr className="border-gray-300"/>
                                    <div className="flex justify-between items-center pt-2"><span className="text-xl font-bold text-indigo-800">Final Score</span><span className="text-4xl font-extrabold text-indigo-600">{calculations.finalScore.toFixed(2)}</span></div>
                                </div>
                            </div>
                        </div>
                         {/* Notes and Save */}
                        <div className="mt-8">
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
                            <textarea id="notes" rows={3} value={notes} onChange={e => {setNotes(e.target.value); setIsFormTouched(true);}} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="e.g., Bright citrus, floral notes of jasmine..."/>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={handleSaveScore} disabled={isSaveDisabled} className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed">
                                <Save className="h-5 w-5 mr-2" /> Save Score
                            </button>
                        </div>
                    </div>
                )}
             </div>
        </div>
    );
};

export default CupperScoringSheet;