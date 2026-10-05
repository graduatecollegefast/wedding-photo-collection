import React, { useState } from 'react';

export default function DashboardLogin({ onLogin, expired }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await onLogin(password);
    } catch (err) {
      setError(err.code === 'wrong_password' ? 'That password is not right. Please try again.' : err.message || 'Could not sign in. Please try again.');
      setBusy(false);
    }
  };

  return (
    <main className="dash-login">
      <form className="card login-card" onSubmit={submit} aria-labelledby="login-title">
        <p className="ornament small-ornament" aria-hidden="true">❦</p>
        <h1 id="login-title" className="names small-names">Your wedding album</h1>
        {expired && <p className="notice" role="status">Your session ended. Please sign in again.</p>}
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
