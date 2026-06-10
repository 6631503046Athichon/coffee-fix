import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
// fix: Removed non-existent CuppingSessionStatus from import.
import { UserRole, JudgeScore, SCA_ATTRIBUTES, CuppingSample, CuppingSession } from '../../types';
import { synthesizeCuppingNotes } from '../../services/external/geminiService';
import { Bot, Loader2, Edit, Save, Lock, Trophy, Clock, ClipboardList, ShieldCheck, Check, AlertTriangle, PlayCircle, Flag } from 'lucide-react';

const ScoreCell: React.FC<{ score: number }> = ({ score }) => {
    let bgColor = 'bg-white';
    if (score >= 9) bgColor = 'bg-green-100';
    else if (score >= 8) bgColor = 'bg-blue-100';
    else if (score >= 7) bgColor = 'bg-yellow-100';
    else bgColor = 'bg-red-100';
    return <td className={`px-4 py-3 text-center text-sm ${bgColor}`}>{score.toFixed(2)}</td>;
}

const CompetitionDashboard: React.FC<{ currentUserRoles: UserRole[] }> = ({ currentUserRoles }) => {
  const { id } = useParams<{ id: string }>();
  const { data, setData } = useDataContext();
  const session = data.cuppingSessions.find(s => s.id === id);
  
  const [synthesizing, setSynthesizing] = useState<Record<string, boolean>>({});
  const [finalNotes, setFinalNotes] = useState<Record<string, string>>({});
  const [editingNotes, setEditingNotes] = useState<Record<string, boolean>>({});
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);

  useEffect(() => {
    if (session?.finalResults) {
        const initialNotes: Record<string, string> = {};
        for (const sampleId in session.finalResults) {
            initialNotes[sampleId] = session.finalResults[sampleId].finalNotes;
        }
        setFinalNotes(initialNotes);
    }
  }, [session]);
  
  const handleSynthesize = useCallback(async (sampleId: string) => {
    if (!session) return;
    const scores = session.scores[sampleId];
    if (!scores || scores.length === 0) return;

    setSynthesizing(prev => ({ ...prev, [sampleId]: true }));
    try {
      const result = await synthesizeCuppingNotes(scores);
      setFinalNotes(prev => ({ ...prev, [sampleId]: result }));
    } catch (error) {
      console.error(error);
      setFinalNotes(prev => ({...prev, [sampleId]: "Failed to generate notes."}));
    } finally {
      setSynthesizing(prev => ({ ...prev, [sampleId]: false }));
    }
  }, [session]);
  
  const getAggregatedResults = useCallback((sample: CuppingSample) => {
    if (!session) return { avgScores: {}, totalScore: 0 };
    const sampleScores = session.scores[sample.id] || [];
    if(sampleScores.length === 0) return { avgScores: {}, totalScore: 0};
    
    const avgScores = SCA_ATTRIBUTES.reduce((acc, attr) => {
        const sum = sampleScores.reduce((s, judgeScore) => s + (judgeScore.scores[attr] || 0), 0);
        acc[attr] = sum / sampleScores.length;
        return acc;
    }, {} as {[key: string]: number});
    
    const totalScore = sampleScores.reduce((sum, s) => sum + s.totalScore, 0) / sampleScores.length;

    return { avgScores, totalScore };
  }, [session]);

  const handleSaveNotes = (sampleId: string) => {
    setEditingNotes(prev => ({...prev, [sampleId]: false}));
     setData(prevData => {
        const newSessions = prevData.cuppingSessions.map(s => {
            if (s.id !== id) return s;
            const newSession = {...s};
            if(!newSession.finalResults) newSession.finalResults = {};
            
            // Ensure sample exists in final results
            if(!newSession.finalResults[sampleId]) {
                 const sample = newSession.samples.find(samp => samp.id === sampleId);
                 if (!sample) return s; // Should not happen
                 const { avgScores, totalScore } = getAggregatedResults(sample);
                 newSession.finalResults[sampleId] = { avgScores, totalScore, finalNotes: '' };
            }
            newSession.finalResults[sampleId].finalNotes = finalNotes[sampleId];
            return newSession;
        });
        return {...prevData, cuppingSessions: newSessions};
     });
  };

  const handleStatusChange = (newStatus: CuppingSession['status']) => {
    setData(prev => ({
        ...prev,
        cuppingSessions: prev.cuppingSessions.map(s => s.id === id ? { ...s, status: newStatus } : s),
    }));
  };

  const handleFinalize = () => {
    if (!session) return;
    const rankedSamples = session.samples
        .map(sample => {
            const { avgScores, totalScore } = getAggregatedResults(sample);
            const notes = finalNotes[sample.id] || session.finalResults?.[sample.id]?.finalNotes || 'No final notes provided.';
            return { id: sample.id, totalScore, avgScores, finalNotes: notes };
        })
        .sort((a, b) => b.totalScore - a.totalScore);

    const newFinalResults: CuppingSession['finalResults'] = {};
    let currentRank = 0;
    let lastScore = -1;
    rankedSamples.forEach((sample, index) => {
        if (sample.totalScore !== lastScore) {
            currentRank = index + 1;
        }
        newFinalResults[sample.id] = {
            totalScore: sample.totalScore,
            avgScores: sample.avgScores,
            finalNotes: sample.finalNotes,
            rank: currentRank,
        };
        lastScore = sample.totalScore;
    });

    setData(prev => ({
        ...prev,
        cuppingSessions: prev.cuppingSessions.map(s => s.id === id ? { ...s, status: 'Finalized', finalResults: newFinalResults } : s),
    }));
    setIsFinalizeModalOpen(false);
  };

  // Admin can view everything like HeadJudge (read-only), but cannot edit scores
  const isAdminOrHeadJudge = currentUserRoles.includes(UserRole.Admin) || currentUserRoles.includes(UserRole.HeadJudge);

  if (!isAdminOrHeadJudge) {
      return (
          <div className="bg-white p-8 rounded-lg shadow">
              <h1 className="text-2xl font-bold">Cupper View</h1>
              <p className="text-gray-600 mt-2">The competition is currently in the '{session?.status}' phase. Please use your Scoring Sheet to submit scores.</p>
          </div>
      )
  }

  if (!session) {
    return <div>Competition not found.</div>;
  }

  const renderContent = () => {
    switch(session.status) {
        case 'Setup':
            return (
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-2xl font-bold mb-4 flex items-center"><ClipboardList className="mr-2 text-gray-500" /> Session Setup</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><h3 className="font-semibold">Judges</h3><ul className="list-disc list-inside">{session.judges.map(j => <li key={j.id}>{j.name}</li>)}</ul></div>
                        <div><h3 className="font-semibold">Samples</h3><ul className="list-disc list-inside">{session.samples.map(s => <li key={s.id}>{s.blindCode}</li>)}</ul></div>
                    </div>
                    <div className="mt-6 border-t pt-4 text-right">
                        <button onClick={() => handleStatusChange('Scoring')} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
                            <PlayCircle className="h-5 w-5 mr-2" /> Start Scoring Phase
                        </button>
                    </div>
                </div>
            );
        case 'Scoring':
            return (
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-2xl font-bold mb-4 flex items-center"><Clock className="mr-2 text-blue-500" /> Scoring in Progress</h2>
                    <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Sample</th>{session.judges.map(j => <th key={j.id} className="px-4 py-4 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">{j.name}</th>)}</tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">{session.samples.map(sample => (
                            <tr key={sample.id}><td className="px-4 py-2 font-medium">{sample.blindCode}</td>{session.judges.map(judge => (
                                <td key={judge.id} className="px-4 py-2 text-center">{(session.scores[sample.id] || []).some(s => s.judgeId === judge.id) && <Check className="h-5 w-5 text-green-500 mx-auto" />}</td>
                            ))}</tr>
                        ))}</tbody>
                    </table></div>
                    <div className="mt-6 border-t pt-4 text-right">
                        <button onClick={() => handleStatusChange('Adjudication')} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                           <Flag className="h-5 w-5 mr-2"/> End Scoring & Begin Adjudication
                        </button>
                    </div>
                </div>
            );
        case 'Finalized':
            // fix: Using a ternary operator ensures `Object.entries` gets a well-typed object,
            // which in turn correctly types `result` in the following `.map()` and prevents type errors.
            const rankedResults = (session.finalResults ? Object.entries(session.finalResults) : [])
                // fix: Cast result to access properties, as Object.entries can lose type info.
                .map(([sampleId, result]) => {
                    const typedResult = result as { avgScores: any; totalScore: any; finalNotes: any; rank?: any; };
                    return {
                        sampleId,
                        avgScores: typedResult.avgScores,
                        totalScore: typedResult.totalScore,
                        finalNotes: typedResult.finalNotes,
                        rank: typedResult.rank
                    };
                })
                .sort((a,b) => (a.rank || 999) - (b.rank || 999));
            return (
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-2xl font-bold mb-4 flex items-center"><Trophy className="mr-2 text-yellow-500" /> Final Results</h2>
                    <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Rank</th><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Sample</th><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Submitter</th><th className="px-4 py-4 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Final Score</th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">{rankedResults.map(result => {
                            const sample = session.samples.find(s => s.id === result.sampleId);
                            const rankColor = result.rank === 1 ? 'bg-yellow-100' : result.rank === 2 ? 'bg-gray-200' : result.rank === 3 ? 'bg-orange-100' : '';
                            return (<tr key={sample?.id || result.sampleId} className={rankColor}>
                                <td className="px-4 py-3 font-bold text-lg">{result.rank}</td>
                                <td className="px-4 py-3 font-medium">{sample?.blindCode} <span className="text-gray-500 text-sm">({sample?.lotInfo.process})</span></td>
                                <td className="px-4 py-3">{sample?.submitterInfo.name}</td>
                                <td className="px-4 py-3 text-center font-bold text-lg text-indigo-600">{result.totalScore.toFixed(2)}</td>
                            </tr>)
                        })}</tbody>
                    </table></div>
                </div>
            );
        case 'Adjudication':
        default:
             return (
                 <>
                 {isFinalizeModalOpen && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg p-8 shadow-2xl w-full max-w-lg text-center">
                    <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Finalize Competition Results?</h2>
                    <p className="text-gray-600 mb-6">This action is irreversible. All scores will be locked, ranks will be calculated, and the competition will be marked as 'Finalized'.</p>
                    <div className="flex justify-center gap-4">
                        <button onClick={() => setIsFinalizeModalOpen(false)} className="py-2 px-6 border rounded-md">Cancel</button>
                        <button onClick={handleFinalize} className="py-2 px-6 border rounded-md text-white bg-red-600 hover:bg-red-700">Yes, Finalize</button>
                    </div>
                </div></div>}
                <div className="bg-white p-6 rounded-lg shadow mb-8">
                    <h2 className="text-2xl font-bold mb-4 flex items-center"><ShieldCheck className="mr-2 text-green-600" /> Adjudication & Finalization</h2>
                    <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Sample</th><th className="px-4 py-4 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Avg. Score</th><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Final Notes</th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">{session.samples.map(sample => {
                            const { totalScore } = getAggregatedResults(sample);
                            const isEditing = editingNotes[sample.id];
                            const note = finalNotes[sample.id] ?? session.finalResults?.[sample.id]?.finalNotes ?? "No notes generated yet.";
                            return (<tr key={sample.id}>
                                <td className="px-4 py-4"><div className="font-bold">{sample.blindCode}</div><div className="text-sm text-gray-500">{sample.lotInfo.process}</div></td>
                                <td className="px-4 py-4 text-center font-bold text-lg text-indigo-600">{totalScore.toFixed(2)}</td>
                                <td className="px-4 py-4">{isEditing ? <textarea value={note} onChange={(e) => setFinalNotes(prev => ({...prev, [sample.id]: e.target.value}))} className="w-full p-2 border rounded-md text-sm" rows={4}/> : <p className="text-sm text-gray-600">{note}</p>}
                                    <div className="mt-2 flex items-center space-x-2">
                                        <button onClick={() => handleSynthesize(sample.id)} disabled={synthesizing[sample.id]} className="inline-flex items-center px-2.5 py-1.5 border text-xs font-medium rounded shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300">
                                           {synthesizing[sample.id] ? <Loader2 className="animate-spin h-4 w-4 mr-1"/> : <Bot className="h-4 w-4 mr-1" />}
                                           {synthesizing[sample.id] ? 'Synthesizing...' : 'AI Synthesis'}
                                        </button>
                                         {isEditing ? <button onClick={() => handleSaveNotes(sample.id)} className="inline-flex items-center px-2.5 py-1.5 border text-xs font-medium rounded shadow-sm"><Save className="h-4 w-4 mr-1"/> Save</button>
                                         : <button onClick={() => setEditingNotes(prev => ({...prev, [sample.id]: true}))} className="inline-flex items-center px-2.5 py-1.5 border text-xs font-medium rounded shadow-sm"><Edit className="h-4 w-4 mr-1"/> Edit</button>}
                                    </div>
                                </td>
                            </tr>)
                        })}</tbody>
                    </table></div>
                    <div className="mt-6 flex justify-end">
                        <button onClick={() => setIsFinalizeModalOpen(true)} className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"><Lock className="h-5 w-5 mr-2" /> Finalize Competition Results</button>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-2xl font-bold mb-4">Score Calibration Table</h2>
                    {session.samples.map(sample => (<div key={sample.id} className="mb-8">
                        <h3 className="text-lg font-semibold mb-2">Sample: {sample.blindCode}</h3>
                        <div className="overflow-x-auto"><table className="min-w-full border-collapse border border-gray-300">
                            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Judge</th>{SCA_ATTRIBUTES.map(attr => <th key={attr} className="px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">{attr}</th>)}<th className="px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Total</th></tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200">{(session.scores[sample.id] || []).map((score: JudgeScore) => (<tr key={score.judgeId}><td className="px-4 py-3 font-medium border-r border-gray-200">{score.judgeName}</td>{SCA_ATTRIBUTES.map(attr => <ScoreCell key={attr} score={score.scores[attr] || 0} />)}<td className="px-4 py-3 font-bold text-center border-l border-gray-200">{score.totalScore.toFixed(2)}</td></tr>))}</tbody>
                        </table></div>
                    </div>))}
                </div>
                </>
             );
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">{session.name}</h1>
      <p className="text-gray-600 mb-2">
        {currentUserRoles.includes(UserRole.Admin) && !currentUserRoles.includes(UserRole.HeadJudge) ? 'Admin Dashboard (Read-Only)' : 'Head Judge Dashboard'}
      </p>
      <div className={`mb-8 text-sm font-semibold inline-flex items-center px-2.5 py-1 rounded-full ${
        session.status === 'Finalized' ? 'bg-green-100 text-green-800' :
        session.status === 'Setup' ? 'bg-gray-200 text-gray-700' :
        session.status === 'Scoring' ? 'bg-blue-100 text-blue-800' :
        'bg-yellow-100 text-yellow-800'
      }`}>
        Status: {session.status}
      </div>
      {renderContent()}
    </div>
  );
};

export default CompetitionDashboard;