import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Coffee, Mail, ArrowLeft } from 'lucide-react';
import { forgotPassword } from '../../services/authService';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [devToken, setDevToken] = useState<string>('');
  const [devResetUrl, setDevResetUrl] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);
    setDevToken('');
    setDevResetUrl('');

    try {
      const response = await forgotPassword(email);
      setSuccess(true);
      // Store dev token and URL for development mode
      if (response.devToken && response.devResetUrl) {
        setDevToken(response.devToken);
        setDevResetUrl(response.devResetUrl);
      }
    } catch (err) {
      let errorMessage = 'Failed to send reset email';

      if (err instanceof Error) {
        errorMessage = err.message;

        // Provide more helpful error messages
        if (errorMessage.includes('Backend server is not available') ||
            errorMessage.includes('Connection timeout') ||
            errorMessage.includes('Cannot connect to backend')) {
          errorMessage = 'Unable to connect to the server. Please ensure the backend server is running.';
        } else if (errorMessage.includes('Failed to send password reset email')) {
          errorMessage = 'Unable to send reset email. Please contact your administrator or try again later.';
        } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          errorMessage = 'Email not found. Please check the email address and try again.';
        }
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Main Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-4 rounded-lg shadow-sm">
              <Coffee className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Coffee Lab</h1>
          <p className="text-gray-600">Digital Quality & Traceability Platform</p>
        </div>

        {/* Forgot Password Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Forgot Password?</h2>
            <p className="text-gray-600">
              Please enter your email or username and we'll send you a password reset link.
            </p>
          </div>

          {success ? (
            <div className="mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <Mail className="h-5 w-5 text-green-600 mt-0.5 mr-3" />
                  <div className="flex-1">
                    <h3 className="text-green-800 font-semibold mb-1">Email Sent Successfully!</h3>
                    <p className="text-green-700 text-sm mb-3">
                      If an account with that email exists, we've sent a password reset link.
                      Please check your email (including spam folder).
                    </p>
                    {/* Development mode: Show reset link directly */}
                    {devToken && devResetUrl && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-blue-800 text-xs font-semibold mb-2">🔧 Development Mode - Reset Link:</p>
                        <a
                          href={devResetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-blue-600 hover:text-blue-700 text-xs break-all underline mb-2"
                        >
                          {devResetUrl}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(devResetUrl);
                            alert('Reset URL copied to clipboard!');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 underline"
                        >
                          Copy Link
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white border-2 border-blue-600 rounded-lg hover:bg-blue-50 hover:border-blue-700 hover:text-blue-700 transition-all duration-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Enter your email or username"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white border-2 border-blue-600 rounded-lg hover:bg-blue-50 hover:border-blue-700 hover:text-blue-700 transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

