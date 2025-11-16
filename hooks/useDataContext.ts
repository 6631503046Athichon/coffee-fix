
import React from 'react';
import { AppData } from '../types';
import { MOCK_DATA } from '../constants';

interface DataContextType {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export const DataContext = React.createContext<DataContextType>({
  data: MOCK_DATA,
  setData: () => {},
});

export const useDataContext = () => React.useContext(DataContext);
