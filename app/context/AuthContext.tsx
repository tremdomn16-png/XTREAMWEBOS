'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as db from '../lib/db';
import { apiFetch } from '../lib/apiClient';
import { useT } from './I18nContext';

interface UserInfo {
    username: string;
    status: string;
    exp_date: string;
    active_cons: string;
    max_connections: string;
}

interface ServerInfo {
    url: string;
    port: string;
    https_port: string;
    server_protocol: string;
    rtmp_port: string;
    timezone: string;
    timestamp_now: number;
    time_now: string;
}

interface StoredAuthData {
    credentials?: {
        username: string;
        password: string;
        hostUrl: string;
    };
    // For M3U mode
    m3uUrl?: string;
    m3uMode?: 'xtream' | 'm3u';
    user: UserInfo;
    server: ServerInfo;
}

interface AuthState {
    user: UserInfo | null;
    server: ServerInfo | null;
    credentials: {
        username: string;
        password: string;
        hostUrl: string;
    } | null;
    m3uUrl: string | null;
    m3uMode: 'xtream' | 'm3u' | null;
    isAuthenticated: boolean;
    login: (serverUrl: string, user: string, pass: string, options?: { redirect?: boolean }) => Promise<{ hostUrl: string; username: string; password: string }>;
    loginPartner: (partner: string, user: string, pass: string, options?: { redirect?: boolean }) => Promise<{ hostUrl: string; username: string; password: string }>;
    loginWithM3U: (m3uUrl: string, options?: { redirect?: boolean }) => Promise<{ mode: string; parsed?: unknown }>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function readStoredAuth(): StoredAuthData | null {
    try {
        const stored = localStorage.getItem('xstream_auth');
        if (!stored) return null;

        const parsed = JSON.parse(stored) as StoredAuthData;
        // support both Xtream (credentials) and M3U (m3uUrl)
        if ((!parsed.credentials && !parsed.m3uUrl) || !parsed.user) return null;

        return parsed;
    } catch (e) {
        console.error("Failed to parse stored auth", e);
        localStorage.removeItem('xstream_auth');
        return null;
    }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6000): Promise<T | null> {
    let timeoutId: number | undefined;

    try {
        const response = await Promise.race([
            apiFetch(url),
            new Promise<never>((_, reject) => {
                timeoutId = window.setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
            })
        ]);

        return await response.json() as T;
    } catch (e) {
        console.warn(`Request failed or timed out: ${url}`, e);
        return null;
    } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
    }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [server, setServer] = useState<ServerInfo | null>(null);
    const [credentials, setCredentials] = useState<AuthState['credentials']>(null);
    const [m3uUrl, setM3uUrl] = useState<string | null>(null);
    const [m3uMode, setM3uMode] = useState<'xtream' | 'm3u' | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const t = useT();

    useEffect(() => {
        const initAuth = async () => {
            try {
                const storedAuth = readStoredAuth();
                if (storedAuth) {
                    if (storedAuth.credentials) setCredentials(storedAuth.credentials);
                    if (storedAuth.m3uUrl) setM3uUrl(storedAuth.m3uUrl);
                    if (storedAuth.m3uMode) setM3uMode(storedAuth.m3uMode);
                    setUser(storedAuth.user);
                    setServer(storedAuth.server || null);
                    setIsAuthenticated(true);
                    setIsLoading(false);
                    // Public mode: do not override with global /api/config if user already has local auth
                    return;
                }

                const data = await fetchJsonWithTimeout<Partial<StoredAuthData>>('/api/config');
                if (data?.credentials && data.user && data.server) {
                    setCredentials(data.credentials);
                    setUser(data.user);
                    setServer(data.server);
                    setIsAuthenticated(true);

                    try {
                        localStorage.setItem('xstream_auth', JSON.stringify(data));
                    } catch (e) {
                        console.warn("Failed to cache server auth", e);
                    }
                } else if (!storedAuth) {
                    setIsAuthenticated(false);
                }
            } catch (e) {
                console.error("Critical error in initAuth:", e);
                if (!readStoredAuth()) {
                    setUser(null);
                    setServer(null);
                    setCredentials(null);
                    setM3uUrl(null);
                    setM3uMode(null);
                    setIsAuthenticated(false);
                } else {
                    const storedAuth = readStoredAuth();
                    if (storedAuth) {
                        if (storedAuth.credentials) setCredentials(storedAuth.credentials);
                        if (storedAuth.m3uUrl) setM3uUrl(storedAuth.m3uUrl);
                        setUser(storedAuth.user);
                        setServer(storedAuth.server || null);
                        setIsAuthenticated(true);
                    }
                }
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (hostUrl: string, username: string, password: string, options?: { redirect?: boolean }) => {
        const redirect = options?.redirect !== false;
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ hostUrl, username, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || t('login.failedShort'));
            }

            const userInfo = data.user_info;
            const serverInfo = data.server_info;

            const authData = {
                credentials: { hostUrl, username, password },
                user: userInfo,
                server: serverInfo
            };

            localStorage.setItem('xstream_auth', JSON.stringify(authData));

            setUser(userInfo);
            setServer(serverInfo);
            setCredentials(authData.credentials);
            setIsAuthenticated(true);

            if (redirect) router.push('/dashboard');
            return { hostUrl, username, password };
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const loginPartner = async (partner: string, username: string, password: string, options?: { redirect?: boolean }) => {
        const redirect = options?.redirect !== false;
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/auth/partner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partner, username, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('login.failedShort'));

            const hostUrl = data.hostUrl as string;
            const authData = {
                credentials: { hostUrl, username, password },
                partner: data.partner,
                user: data.user_info,
                server: data.server_info,
            };
            localStorage.setItem('xstream_auth', JSON.stringify(authData));
            setUser(data.user_info);
            setServer(data.server_info);
            setCredentials(authData.credentials);
            setIsAuthenticated(true);
            if (redirect) router.push('/dashboard');
            return { hostUrl, username, password };
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const loginWithM3U = async (m3uUrlInput: string, options?: { redirect?: boolean }) => {
        const redirect = options?.redirect !== false;
        setIsLoading(true);
        try {
            // call our new parser endpoint
            const res = await apiFetch('/api/m3u/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ m3uUrl: m3uUrlInput.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('login.failedShort'));

            // If M3U was actually an Xtream link, do Xtream login flow
            if (data.mode === 'xtream' && data.credentials) {
                const c = data.credentials as { hostUrl: string; username: string; password: string };
                await login(c.hostUrl, c.username, c.password, { redirect });
                return data;
            }

            // Generic M3U mode: store m3uUrl + dummy user/server so isAuthenticated works
            const authData: StoredAuthData = {
                m3uUrl: m3uUrlInput.trim(),
                m3uMode: 'm3u',
                user: { username: 'm3u', status: 'Active', exp_date: '', active_cons: '0', max_connections: '1' },
                server: { url: m3uUrlInput, port: '', https_port: '', server_protocol: 'http', rtmp_port: '', timezone: '', timestamp_now: Date.now()/1000, time_now: '' },
            };
            // also persist parsed counts for quick dashboard header
            try {
                localStorage.setItem('xstream_auth', JSON.stringify(authData));
                if (data.parsed) localStorage.setItem('xstream_m3u_parsed', JSON.stringify(data.parsed));
            } catch {}
            setM3uUrl(authData.m3uUrl || null);
            setM3uMode('m3u');
            setUser(authData.user);
            setServer(authData.server);
            setCredentials(null);
            setIsAuthenticated(true);
            if (redirect) router.push('/dashboard');
            return data;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await Promise.all([
                apiFetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                }),
                db.clearCache()
            ]);
        } catch (e) {
            console.error("Failed to clear server config or database", e);
        }
        localStorage.removeItem('xstream_auth');
        localStorage.removeItem('xstream_m3u_parsed');
        setUser(null);
        setServer(null);
        setCredentials(null);
        setM3uUrl(null);
        setM3uMode(null);
        setIsAuthenticated(false);
        router.push('/');
    };

    return (
        <AuthContext.Provider value={{ user, server, credentials, m3uUrl, m3uMode, isAuthenticated, login, loginPartner, loginWithM3U, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
