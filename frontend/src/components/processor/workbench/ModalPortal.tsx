import React from 'react'
import ReactDOM from 'react-dom'

/**
 * Renders children into document.body via a React portal.
 * Used by the workbench to lift modals out of stacking-context traps.
 */
export const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return ReactDOM.createPortal(children, document.body)
}

export default ModalPortal
