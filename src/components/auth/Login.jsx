import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getSystemSetting } from "../../lib/settingsAPI";
import {
  Mail,
  Lock,
  LogIn,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import BrandLogo from "../shared/BrandLogo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError) throw signInError;

      if (!data.user?.id) {
        throw new Error("Login failed");
      }

      const { data: authData } = await supabase.auth.getUser();
      const freshUser = authData.user ?? data.user;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileError) throw profileError;

      const role = profile.role?.toLowerCase().trim();

      if (role === "student") {
        try {
          const { data: setting } = await getSystemSetting("maintenance_mode");
          if (setting && setting.value === "true") {
            await supabase.auth.signOut();
            navigate("/maintenance", { replace: true });
            return;
          }
        } catch (maintenanceError) {
          console.error("Maintenance check skipped:", maintenanceError);
        }
      }

      if (role === "tutor") {
        navigate("/tutor");
      } else if (role === "student") {
        if (freshUser?.app_metadata?.force_password_reset) {
          navigate("/reset-password", { replace: true });
        } else {
          navigate("/student");
        }
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error("Login Error:", error);
      setError(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <BrandLogo size={52} wordmarkSize={26} />
          <div className="header-icon">
            <ShieldCheck size={32} />
          </div>
          <h2>Welcome Back</h2>
          <p>Sign in to continue to Edumaxim</p>
        </div>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Mail className="input-icon" size={18} />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Lock className="input-icon" size={18} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-auth">
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Sign In <LogIn size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account? <Link to="/register">Create Account</Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: radial-gradient(
            circle at center,
            #1e293b 0%,
            #0f172a 100%
          );
        }

        .auth-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 2.5rem;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
          color: white;
        }

        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .header-icon {
          color: #7c3aed;
          margin: 1rem 0;
        }

        .auth-error {
          background: rgba(220, 38, 38, 0.2);
          border: 1px solid rgba(220, 38, 38, 0.4);
          color: #fca5a5;
          padding: 0.75rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
        }

        .input-group {
          margin-bottom: 1.25rem;
        }
        .input-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }
        .input-wrapper {
          position: relative;
        }
        .input-wrapper input {
          width: 100%;
          padding: 0.75rem 2.5rem 0.75rem 0.75rem;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
        }
        .input-icon {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .btn-auth {
          width: 100%;
          padding: 0.75rem;
          background: #7c3aed;
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: background 0.2s;
        }
        .btn-auth:hover {
          background: #6d28d9;
        }
        .auth-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
