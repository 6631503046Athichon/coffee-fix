import { useState, useCallback } from 'react';

export interface UseEditDeleteOptions<T> {
  onEdit?: (item: T) => void;
  onDelete?: (id: string) => void;
  confirmDelete?: boolean;
  deleteConfirmMessage?: string;
}

export interface EditDeleteReturn<T> {
  editingItem: T | null;
  isEditModalOpen: boolean;
  openEditModal: (item: T, e?: React.MouseEvent) => void;
  closeEditModal: () => void;
  handleDelete: (id: string, e?: React.MouseEvent) => void;
  setEditingItem: (item: T | null) => void;
}

export function useEditDelete<T extends { id: string }>({
  onEdit,
  onDelete,
  confirmDelete = true,
  deleteConfirmMessage = 'Are you sure you want to delete this item?',
}: UseEditDeleteOptions<T> = {}): EditDeleteReturn<T> {
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const openEditModal = useCallback((item: T, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setEditingItem(item);
    setIsEditModalOpen(true);
    onEdit?.(item);
  }, [onEdit]);

  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingItem(null);
  }, []);

  const handleDelete = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (confirmDelete) {
      if (window.confirm(deleteConfirmMessage)) {
        onDelete?.(id);
      }
    } else {
      onDelete?.(id);
    }
  }, [onDelete, confirmDelete, deleteConfirmMessage]);

  return {
    editingItem,
    isEditModalOpen,
    openEditModal,
    closeEditModal,
    handleDelete,
    setEditingItem,
  };
}
