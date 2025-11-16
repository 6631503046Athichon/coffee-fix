

import React, { useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { Link } from 'react-router-dom';
import { FlaskConical, Calendar, Users, PlusCircle, Edit } from 'lucide-react';
import { CuppingSession, CuppingSessionType } from '../../types';
import CreateCuppingSessionModal from './CreateCuppingSessionModal';

const CuppingSessionCard: React.FC<{ session: CuppingSession; onEdit: (session: CuppingSession) => void; }> = ({ session, onEdit }) => {
    const linkTo = session.type === CuppingSessionType.Competition
        ? `/competition/${session.id}`
        : `/cupping/${session.id}`;

    const canEdit = session.status === 'Setup';

    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow flex flex-col">
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-lg font-bold text-indigo-700">{session.name}</h3>
                        <p className={`mt-1 text-xs font-semibold inline-flex items-center px-2.5 py-0.5 rounded-full ${session.type === 'Competition' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{session.type}</p>
                    </div>
                    <span className={`text-xs font-semibold inline-flex items-center px-2.5 py-0.5 rounded-full ${session.status === 'Finalized' ? 'bg-green-100 text-green-800' : session.status === 'Setup' ? 'bg-gray-200 text-gray-700' : 'bg-yellow-100 text-yellow-800'}`}>{session.status}</span>
                </div>
                <div className="mt-4 flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{session.date}</span>
                </div>
                <div className="mt-2 flex items-center text-sm text-gray-600">
                    <Users className="h-4 w-4 mr-2" />
                    <span>{session.judges.length} Judges, {session.samples.length} Samples</span>
                </div>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                <Link to={linkTo} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                    {session.type === CuppingSessionType.Competition ? 'Admin Dashboard' : 'View Session'} &rarr;
                </Link>
                {canEdit && (
                    <button
                        onClick={() => onEdit(session)}
                        className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                        title="Edit Session"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
};

const CuppingHub: React.FC = () => {
  const { data, setData } = useDataContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<CuppingSession | null>(null);

  const handleOpenCreateModal = () => {
    setSessionToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (session: CuppingSession) => {
    setSessionToEdit(session);
    setIsModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSessionToEdit(null); // Ensure edit state is cleared on close
  };

  const handleSaveSession = (sessionData: Partial<CuppingSession>) => {
    if (sessionToEdit) {
      // Edit existing session
      setData(prevData => ({
        ...prevData,
        cuppingSessions: prevData.cuppingSessions.map(s =>
          s.id === sessionToEdit.id ? { ...s, ...sessionData } : s
        ),
      }));
    } else {
      // Create new session
      const newSessionIdNumber = Math.max(...data.cuppingSessions.map(s => parseInt(s.id.replace('CS', ''))), 0) + 1;
      const newSessionId = `CS${String(newSessionIdNumber).padStart(3, '0')}`;
      
      const newSession: CuppingSession = {
          id: newSessionId,
          name: sessionData.name || 'Unnamed Session',
          date: sessionData.date || new Date().toISOString().substring(0, 10),
          type: sessionData.type || CuppingSessionType.QC,
          samples: sessionData.samples || [],
          judges: sessionData.judges || [],
          scores: {},
          status: 'Setup',
      };

      setData(prevData => ({
          ...prevData,
          cuppingSessions: [newSession, ...prevData.cuppingSessions],
      }));
    }
    handleCloseModal();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold text-gray-900">Cupping Hub</h1>
            <p className="text-gray-600 mt-1">Central dashboard for all sensory evaluation sessions.</p>
        </div>
        <button 
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            <PlusCircle className="h-5 w-5 mr-2" />
            Create New Session
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.cuppingSessions
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(session => (
                <CuppingSessionCard key={session.id} session={session} onEdit={handleOpenEditModal} />
        ))}
      </div>
      
      <CreateCuppingSessionModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSaveSession={handleSaveSession}
        sessionToEdit={sessionToEdit}
      />
    </div>
  );
};

export default CuppingHub;