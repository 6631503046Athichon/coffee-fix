
import React from 'react';
import { AppData } from '../types';
import { INITIAL_APP_DATA } from '../constants';

export type SaleOrdersStatus = 'loading' | 'ok' | 'failed';

interface DataContextType {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  refreshData: () => Promise<void>;
  setIsEditing: (editing: boolean) => void;
  isEditing: boolean;
  /** Whether the sales list has loaded: 'failed' only while no load has ever succeeded.
   *  Optional so hand-built test contexts keep compiling; missing means 'ok'. */
  saleOrdersStatus?: SaleOrdersStatus;
}

export const DataContext = React.createContext<DataContextType>({
  data: INITIAL_APP_DATA,
  setData: () => {},
  refreshData: async () => {},
  setIsEditing: () => {},
  isEditing: false,
  saleOrdersStatus: 'ok',
});

export const useDataContext = () => React.useContext(DataContext);
