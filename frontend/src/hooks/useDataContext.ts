
import React from 'react';
import { AppData } from '../types';
import { MOCK_DATA } from '../constants';

interface DataContextType {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  refreshData: () => Promise<void>;
  setIsEditing: (editing: boolean) => void;
  isEditing: boolean;
}

export const DataContext = React.createContext<DataContextType>({
  data: MOCK_DATA,
  setData: () => {},
  refreshData: async () => {},
  setIsEditing: () => {},
  isEditing: false,
});

export const useDataContext = () => React.useContext(DataContext);
