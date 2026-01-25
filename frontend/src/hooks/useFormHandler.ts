import React, { useState, useCallback } from 'react';

export interface UseFormHandlerOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => void | Promise<void>;
  validate?: (values: T) => Partial<Record<keyof T, string>>;
  successMessage?: string;
  successTimeout?: number;
}

export interface FormHandlerReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  showSuccess: boolean;
  successMessage: string;
  handleChange: (field: keyof T, value: any) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  resetForm: () => void;
  setValues: (values: T) => void;
  setFieldError: (field: keyof T, error: string) => void;
}

export function useFormHandler<T extends Record<string, any>>({
  initialValues,
  onSubmit,
  validate,
  successMessage = 'Success!',
  successTimeout = 3000,
}: UseFormHandlerOptions<T>): FormHandlerReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleChange = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    // Clear error when field changes
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Validate if validator is provided
    if (validate) {
      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await onSubmit(values);

      // Show success message
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), successTimeout);

      // Reset form to initial values
      setValues(initialValues);
    } catch (error) {
      console.error('Form submission error:', error);
      // You could add error handling here
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit, initialValues, successTimeout]);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setShowSuccess(false);
    setIsSubmitting(false);
  }, [initialValues]);

  const setFieldError = useCallback((field: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [field]: error }));
  }, []);

  return {
    values,
    errors,
    isSubmitting,
    showSuccess,
    successMessage,
    handleChange,
    handleSubmit,
    resetForm,
    setValues,
    setFieldError,
  };
}
