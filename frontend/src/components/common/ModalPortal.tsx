import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Renders children into document.body via a React portal.
 *
 * Wrap a hand-rolled `fixed inset-0` popup in this so its backdrop covers the
 * whole screen. Left inline, a popup inside a `space-y-*` page picks up that
 * container's top margin (a strip at the top stays undimmed), and an ancestor
 * with a transform or filter would become its containing block. React events
 * and context still flow through the portal as before.
 */
export const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};

export default ModalPortal;
