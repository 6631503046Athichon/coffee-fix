

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { ArrowLeft, Calendar, Users, FlaskConical, CheckCircle } from 'lucide-react';
import { CuppingSession, SCA_ATTRIBUTES, User } from '../../types';

const InfoCard: React.FC<{ icon: React.ElementType, label: string, value: string, color: string }> = ({ icon: Icon, label, value, color }) => (
    <div className="flex items-center p-3 bg-white rounded-lg border">
        <Icon className={`h-6 w-6 mr-3 ${color}`} />
        <div>
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <p className="text-sm font-semibold text-gray-800">{value}</p>
        </div>
    </div>
);

const ScoreTable: React.FC<{ session: CuppingSession, sampleId: string }> = ({ session, sampleId }) => {
    const scores = session.scores[sampleId] || [];

    if (scores.length === 0) {
        return <p className="text-sm text-gray-500 mt-4">No scores have been recorded for this sample yet.</p>;
    }

    return (
        <div className="overflow-x-auto mt-4">
            <table className="min-w-full border-collapse border border-gray-200">
                <thead className="bg-gray-900">
                    <tr>
                        <th className="px-3 py-4 text-left text-xs font-bold text-white uppercase tracking-wider border border-gray-200">Judge</th>
                        {SCA_ATTRIBUTES.map(attr => <th key={attr} className="px-2 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border border-gray-200" title={attr}>{attr.split('/')[0]}</th>)}
                        <th className="px-3 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border border-gray-200">Total</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {scores.map(score => (
                        <tr key={score.judgeId}>
                            <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-800 border border-gray-200">{score.judgeName}</td>
                            {SCA_ATTRIBUTES.map(attr => (
                                <td key={attr} className="px-2 py-2 text-center text-sm text-gray-600 border border-gray-200">{score.scores[attr]?.toFixed(2) || 'N/A'}</td>
                            ))}
                            <td className="px-3 py-2 text-center text-sm font-bold text-indigo-600 border border-gray-200">{score.totalScore.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const CuppingSessionDetail: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const { id } = useParams<{ id: string }>();
    const { data } = useDataContext();
    const session = data.cuppingSessions.find(s => s.id === id);

    if (!session) {
        return (
            <div className="text-center p-8">
                <h1 className="text-2xl font-bold">Session Not Found</h1>
                <Link to="/cupping" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to Cupping Hub
                </Link>
            </div>
        );
    }

    return (
        <div>
            <Link to="/cupping" className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Cupping Hub
            </Link>

            <div className="bg-white shadow-lg rounded-lg p-6 mb-8 border border-gray-200">
                <div className="flex flex-col md:flex-row justify-between md:items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{session.name}</h1>
                        <p className={`mt-1 text-sm font-semibold inline-flex items-center px-2.5 py-0.5 rounded-full ${session.type === 'Competition' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{session.type}</p>
                    </div>
                    <div className="mt-4 md:mt-0 grid grid-cols-2 md:grid-cols-3 gap-3">
                        <InfoCard icon={Calendar} label="Date" value={session.date} color="text-blue-500" />
                        <InfoCard icon={Users} label="Judges" value={`${session.judges.length}`} color="text-green-500" />
                        <InfoCard icon={FlaskConical} label="Samples" value={`${session.samples.length}`} color="text-yellow-500" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <div className="bg-white shadow rounded-lg p-6 border border-gray-200">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center"><Users className="h-5 w-5 mr-2 text-gray-500" /> Judges</h2>
                        <ul className="space-y-3">
                            {session.judges.map(judge => (
                                <li key={judge.id} className="flex items-center p-2 bg-gray-50 rounded-md">
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900">{judge.name}</p>
                                        <p className="text-sm text-gray-500">{judge.role}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="lg:col-span-2 space-y-6">
                    {session.samples.map(sample => {
                        const scoresForSample = session.scores[sample.id] || [];
                        const hasScored = scoresForSample.some(score => score.judgeId === currentUser.id);

                        return (
                            <div key={sample.id} className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
                                <div className="p-4 bg-gray-50 border-b border-gray-200">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-lg font-bold text-gray-800">Sample: <span className="text-indigo-600">{sample.blindCode}</span></h3>
                                        {hasScored && (
                                            <span className="flex items-center text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                                <CheckCircle className="h-4 w-4 mr-1.5" />
                                                Scored
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {sample.lotInfo.process} from {sample.originInfo.farm} (Submitter: {sample.submitterInfo.name})
                                    </p>
                                </div>
                                <div className="p-4">
                                    {session.finalResults && session.finalResults[sample.id] && (
                                        <div className="mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                                            <h4 className="text-md font-bold text-gray-800 mb-2">Final Result</h4>
                                            <div className="flex items-start gap-6">
                                                <div className="text-center">
                                                    <p className="text-xs text-gray-500">AVG. SCORE</p>
                                                    <p className="text-4xl font-extrabold text-indigo-600">{session.finalResults[sample.id].totalScore.toFixed(2)}</p>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs text-gray-500">FINAL NOTES</p>
                                                    <p className="text-sm italic text-gray-700">"{session.finalResults[sample.id].finalNotes}"</p>
                                                </div>
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-indigo-200">
                                                <h5 className="text-sm font-semibold text-gray-700 mb-2">Average Attribute Scores</h5>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                                                    {SCA_ATTRIBUTES.map(attr => (
                                                        <div key={attr} className="flex justify-between">
                                                            <span className="text-gray-600">{attr.split('/')[0]}:</span>
                                                            <span className="font-bold text-gray-800">
                                                                {session.finalResults[sample.id].avgScores[attr]?.toFixed(2) || 'N/A'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <h4 className="text-md font-semibold text-gray-700 mb-2">Individual Score Breakdown</h4>
                                    <ScoreTable session={session} sampleId={sample.id} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CuppingSessionDetail;
