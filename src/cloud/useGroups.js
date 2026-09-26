import { useEffect, useState } from 'react';
import { driveLogin, driveLogout, driveGetEmail, isLoggedIn } from './driveStorage';
import { createGroup, getGroup, roleOf, findMyGroups } from './groupStorage';

const urlKeepingRoom = (query = '') => {
  const p = new URLSearchParams(query);
  const c = new URLSearchParams(window.location.search).get('c');
  if (c) p.set('c', c);
  const qs = p.toString();
  return window.location.pathname + (qs ? `?${qs}` : '');
};

export function useGroups() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [email, setEmail] = useState(null);
  const [groupId, setGroupId] = useState(new URLSearchParams(window.location.search).get('g'));
  const [group, setGroup] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [myGroups, setMyGroups] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { return await fn(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const login = () => run(async () => {
    await driveLogin();
    setLogged(true);
    setEmail(await driveGetEmail());
  });

  const logout = () => {
    driveLogout(); setLogged(false); setEmail(null);
    setGroup(null); setMyGroups(null); setGroupId(null);
    window.history.pushState({}, '', urlKeepingRoom());
  };

  useEffect(() => {
    if (logged && !email) run(async () => setEmail(await driveGetEmail()));
  }, [logged]);

  useEffect(() => {
    if (!logged || !email) return;
    run(async () => setMyGroups(await findMyGroups(email)));
  }, [logged, email]);

  useEffect(() => {
    if (!logged || !email || !groupId) { setGroup(null); setMyRole(null); return; }
    run(async () => {
      const g = await getGroup(groupId);
      if (!g) { setMsg('Không tìm thấy group này.'); return; }
      const role = roleOf(g, email);
      if (!role) { setMsg('Bạn chưa được mời vào group này.'); return; }
      setGroup(g); setMyRole(role);
    });
  }, [logged, email, groupId]);

  const openGroup = (g) => {
    setGroupId(g.id);
    window.history.pushState({}, '', urlKeepingRoom(`g=${g.id}`));
  };

  const backToMyGroups = () => {
    setGroup(null); setGroupId(null);
    window.history.pushState({}, '', urlKeepingRoom());
  };

  const handleCreateGroup = (name) => run(async () => {
    const id = await createGroup(name, email);
    setMyGroups((gs) => [...(gs || []), { id, name, members: { [email]: 'owner' } }]);
    openGroup({ id });
  });

  return { logged, email, login, logout, groupId, group, myRole, myGroups,
           openGroup, backToMyGroups, handleCreateGroup, busy, msg };
}