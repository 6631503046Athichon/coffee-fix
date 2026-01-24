import React, { useState, useEffect } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { CuppingSession, CuppingSessionType, CuppingSample, UserRole } from '../../types';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import DatePicker from '../common/DatePicker';

interface CreateCuppingSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveSession: (session: Partial<CuppingSession>) => void;
    sessionToEdit?: CuppingSession | null;
}

const CreateCuppingSessionModal: React.FC<CreateCuppingSessionModalProps> = ({ isOpen, onClose, onSaveSession, sessionToEdit }) => {
    const { data } = useDataContext();
    const isEditMode = !!sessionToEdit;

    const [name, setName] = useState('');
    const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
    const [type, setType] = useState<CuppingSessionType>(CuppingSessionType.QC);
    const [selectedJudges, setSelectedJudges] = useState<string[]>([]);
    const [samples, setSamples] = useState<Partial<CuppingSample>[]>([]);
    
    // State for the new sample form
    const [blindCode, setBlindCode] = useState('');
    const [submitter, setSubmitter] = useState('');
    const [origin, setOrigin] = useState('');
    const [process, setProcess] = useState('');
    const [sampleError, setSampleError] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (isEditMode && sessionToEdit) {
                setName(sessionToEdit.name);
                setDate(sessionToEdit.date);
                setType(sessionToEdit.type);
                setSelectedJudges(sessionToEdit.judges.map(j => j.id));
                setSamples(sessionToEdit.samples.map(s => ({...s}))); // Create a copy to avoid direct mutation
                setSampleError('');
                setFormError('');
            } else {
                setName('');
                setDate(new Date().toISOString().substring(0, 10));
                setType(CuppingSessionType.QC);
                setSelectedJudges([]);
                setSamples([]);
                setBlindCode('');
                setSubmitter('');
                setOrigin('');
                setProcess('');
                setSampleError('');
                setFormError('');
            }
        }
    }, [isOpen, sessionToEdit, isEditMode]);

    const handleAddSample = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!blindCode || !submitter || !origin || !process) {
            setSampleError("Please fill all sample fields.");
            return;
        }
        setSampleError('');
        const newSample: Partial<CuppingSample> = {
            id: `temp-${Date.now()}`, // More unique temporary ID
            blindCode,
            submitterInfo: { name: submitter },
            originInfo: { farm: origin },
            lotInfo: { process },
        };
        setSamples([...samples, newSample]);
        // Clear sample form
        setBlindCode('');
        setSubmitter('');
        setOrigin('');
        setProcess('');
    };

    const handleRemoveSample = (sampleId: string) => {
        setSamples(samples.filter(s => s.id !== sampleId));
    };

    const handleSampleChange = (index: number, field: 'blindCode' | 'submitter' | 'origin' | 'process', value: string) => {
        setSamples(currentSamples => {
            const newSamples = [...currentSamples];
            const sample = { ...newSamples[index] };
            
            if (field === 'blindCode') {
                sample.blindCode = value;
            } else if (field === 'submitter') {
                sample.submitterInfo = { name: value };
            } else if (field === 'origin') {
                sample.originInfo = { farm: value };
            } else if (field === 'process') {
                sample.lotInfo = { process: value };
            }
            
            newSamples[index] = sample;
            return newSamples;
        });
    };
    
    const handleMoveSample = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === samples.length - 1)) {
            return;
        }
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        const updatedSamples = [...samples];
        [updatedSamples[index], updatedSamples[newIndex]] = [updatedSamples[newIndex], updatedSamples[index]]; // Swap elements
        setSamples(updatedSamples);
    };
    
    const handleJudgeToggle = (judgeId: string) => {
        setSelectedJudges(prev => 
            prev.includes(judgeId) ? prev.filter(id => id !== judgeId) : [...prev, judgeId]
        );
    };

    const [formError, setFormError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !date || selectedJudges.length === 0 || samples.length === 0) {
            setFormError("Please fill all required fields and add at least one judge and one sample.");
            return;
        }
        setFormError('');

        const judgeObjects = data.users
            .filter(u => selectedJudges.includes(u.id))
            .map(u => ({ id: u.id, name: u.name, role: u.role as UserRole.Cupper | UserRole.HeadJudge }));

        const existingSampleNumbers = samples
            .map(s => parseInt(s.id?.replace(/S|temp-/g, '') || ''))
            .filter(n => !isNaN(n));
        let maxSampleNumber = existingSampleNumbers.length > 0 ? Math.max(...existingSampleNumbers) : 0;
    
        const finalSamples = samples.map(s => {
            let newId = s.id;
            if (s.id?.startsWith('temp-') || !s.id) {
                maxSampleNumber++;
                newId = `S${String(maxSampleNumber).padStart(2, '0')}`;
            }
            return {
                id: newId!,
                blindCode: s.blindCode || '',
                greenBeanLotId: s.greenBeanLotId,
                submitterInfo: s.submitterInfo || { name: '' },
                originInfo: s.originInfo || { farm: '' },
                lotInfo: s.lotInfo || { process: '' },
            };
        }) as CuppingSample[];

        const sessionData: Partial<CuppingSession> = {
            name,
            date,
            type,
            judges: judgeObjects,
            samples: finalSamples,
        };
        
        onSaveSession(sessionData);
    };

    if (!isOpen) return null;

    const availableJudges = data.users.filter(u => u.role === UserRole.Cupper || u.role === UserRole.HeadJudge);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog" onClick={onClose}>
            <div className="bg-white rounded-lg p-8 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">{isEditMode ? 'Edit Cupping Session' : 'Create New Cupping Session'}</h2>
                    <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800">
                        <X className="h-6 w-6" />
                    </button>
                </div>
                {formError && (
                    <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                        {formError}
                    </div>
                )}
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                        {/* Left Column */}
                        <div>
                             {/* Session Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700">Session Name</label>
                                    <input type="text" id="sessionName" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                                </div>
                                <div>
                                    <DatePicker
                                        value={date}
                                        onChange={setDate}
                                        label="Date"
                                        required
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="sessionType" className="block text-sm font-medium text-gray-700">Session Type</label>
                                    <select id="sessionType" value={type} onChange={e => setType(e.target.value as CuppingSessionType)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                        {Object.values(CuppingSessionType).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            {/* Judges */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-700 mb-2">Judges ({selectedJudges.length} selected)</h3>
                                <div className="p-2 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
                                    <div className="space-y-1">
                                    {availableJudges.map(judge => (
                                        <label key={judge.id} className={`flex items-center space-x-3 cursor-pointer p-2 rounded-md transition-colors ${selectedJudges.includes(judge.id) ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}>
                                                <input type="checkbox" checked={selectedJudges.includes(judge.id)} onChange={() => handleJudgeToggle(judge.id)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                                                <span className="text-sm text-gray-800 font-medium">{judge.name} <span className="text-xs text-gray-500 font-normal">({judge.role})</span></span>
                                        </label>
                                    ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Right Column (Samples) */}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">Samples ({samples.length})</h3>
                            {/* Add Sample Form */}
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4">
                                {sampleError && (
                                    <div className="mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                                        {sampleError}
                                    </div>
                                )}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                                    <input type="text" placeholder="Blind Code" value={blindCode} onChange={e => { setBlindCode(e.target.value); setSampleError(''); }} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                    <input type="text" placeholder="Submitter" value={submitter} onChange={e => { setSubmitter(e.target.value); setSampleError(''); }} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                    <input type="text" placeholder="Origin/Farm" value={origin} onChange={e => { setOrigin(e.target.value); setSampleError(''); }} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                    <input type="text" placeholder="Process" value={process} onChange={e => { setProcess(e.target.value); setSampleError(''); }} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                </div>
                                <button type="button" onClick={handleAddSample} className="mt-2 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-indigo-500 hover:bg-indigo-600">
                                    <Plus className="h-4 w-4 mr-1"/> Add Sample
                                </button>
                            </div>

                            {/* Sample List */}
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {isEditMode ? (
                                    samples.map((s, index) => (
                                        <div key={s.id} className="flex items-start gap-2 p-2 bg-white border rounded-md">
                                            <div className="flex flex-col gap-1.5">
                                                <button type="button" onClick={() => handleMoveSample(index, 'up')} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp size={16} /></button>
                                                <button type="button" onClick={() => handleMoveSample(index, 'down')} disabled={index === samples.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown size={16} /></button>
                                            </div>
                                            <div className="flex-grow grid grid-cols-2 gap-2">
                                                <input type="text" placeholder="Blind Code" value={s.blindCode || ''} onChange={e => handleSampleChange(index, 'blindCode', e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                                <input type="text" placeholder="Submitter" value={s.submitterInfo?.name || ''} onChange={e => handleSampleChange(index, 'submitter', e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                                <input type="text" placeholder="Origin" value={s.originInfo?.farm || ''} onChange={e => handleSampleChange(index, 'origin', e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                                <input type="text" placeholder="Process" value={s.lotInfo?.process || ''} onChange={e => handleSampleChange(index, 'process', e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm text-sm p-2" />
                                            </div>
                                            <button type="button" onClick={() => handleRemoveSample(s.id!)} className="p-1 text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                        </div>
                                    ))
                                ) : (
                                    samples.map(s => (
                                        <div key={s.id} className="flex justify-between items-center p-2 bg-white border rounded-md">
                                            <p className="text-sm">Code: <span className="font-bold">{s.blindCode}</span>, Submitter: {s.submitterInfo?.name}</p>
                                            <button type="button" onClick={() => handleRemoveSample(s.id!)} className="text-red-500 hover:text-red-700">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8 pt-6 border-t flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Cancel</button>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{isEditMode ? 'Save Changes' : 'Create Session'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateCuppingSessionModal;
