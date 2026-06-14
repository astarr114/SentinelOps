import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Shield, Eye, EyeOff, Terminal } from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signInWithUsername, signUpWithUsername } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? '/';

  const validateUsername = (u: string) => /^[a-zA-Z0-9_]+$/.test(u);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('Username and password are required');
      return;
    }
    if (!validateUsername(username)) {
      toast.error('Username may only contain letters, digits, and underscores');
      return;
    }
    if (mode === 'register' && !agreed) {
      toast.error('Please accept the User Agreement & Privacy Policy');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signInWithUsername(username, password);
        if (error) throw error;
        toast.success('Access granted — welcome to SentinelOps');
        navigate(from, { replace: true });
      } else {
        const { error } = await signUpWithUsername(username, password);
        if (error) throw error;
        toast.success('Account created — you are now logged in');
        navigate(from, { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      toast.error(msg.includes('Invalid login') ? 'Invalid username or password' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      {/* Background grid */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center">
            <img
              src="/images/logo/sentinelops-logo.png"
              alt="SentinelOps Logo"
              className="h-24 w-24 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">SentinelOps</h1>
          <p className="mt-1 text-sm text-muted-foreground">Agentic Incident Commander</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6">
          {/* Tab toggle */}
          <div className="mb-6 flex rounded-lg border border-border bg-muted p-1">
            <button
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
            <button
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-normal text-muted-foreground">Username</Label>
              <div className="relative">
                <Terminal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  className="bg-input border-border pl-9 text-base placeholder:text-muted-foreground/50 focus-visible:ring-primary"
                  placeholder="your_username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-normal text-muted-foreground">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="bg-input border-border pr-10 text-base placeholder:text-muted-foreground/50 focus-visible:ring-primary"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 p-3">
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={v => setAgreed(!!v)}
                  className="mt-0.5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label htmlFor="agree" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <span className="text-primary underline-offset-2 hover:underline cursor-pointer">User Agreement</span>
                  {' '}and{' '}
                  <span className="text-primary underline-offset-2 hover:underline cursor-pointer">Privacy Policy</span>.
                  Your data is used solely to operate SentinelOps incident management features.
                </label>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-10"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  {mode === 'login' ? 'Authenticating...' : 'Creating account...'}
                </span>
              ) : (
                mode === 'login' ? 'Access SentinelOps' : 'Create Account'
              )}
            </Button>
          </form>

          {mode === 'login' && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              No account?{' '}
              <button className="text-primary hover:underline" onClick={() => setMode('register')}>Register here</button>
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          Secured by Supabase Auth · SentinelOps v2.0
        </p>
      </div>
    </div>
  );
}
