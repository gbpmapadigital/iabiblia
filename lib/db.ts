import { supabase } from './supabase';

// Helper to get a persistent device ID for anonymous users
const getUserId = () => {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('biblia_ai_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('biblia_ai_user_id', id);
  }
  return id;
};

export type Highlight = {
  verse: number;
  color: string;
};

export type StudyHistory = {
  id: string;
  title: string;
  date: string;
};

export type Message = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export async function getHighlights(bookId: string, chapter: number): Promise<Highlight[]> {
  const userId = getUserId();
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('highlights')
        .select('verse, color')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .eq('chapter', chapter);
        
      if (!error && data) return data;
    } catch (e) {
      console.error('Supabase error, falling back to local', e);
    }
  }
  
  // Fallback to localStorage
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem(`highlights_${userId}_${bookId}_${chapter}`);
    if (local) return JSON.parse(local);
  }
  return [];
}

export async function saveHighlight(bookId: string, chapter: number, verse: number, color: string) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('highlights')
        .upsert({ 
          user_id: userId, 
          book_id: bookId, 
          chapter, 
          verse, 
          color,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,book_id,chapter,verse' });
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  // Always save to local as fallback/cache
  if (typeof window !== 'undefined') {
    const key = `highlights_${userId}_${bookId}_${chapter}`;
    const existing = localStorage.getItem(key);
    let highlights: Highlight[] = existing ? JSON.parse(existing) : [];
    
    highlights = highlights.filter(h => h.verse !== verse);
    highlights.push({ verse, color });
    localStorage.setItem(key, JSON.stringify(highlights));
  }
}

export async function removeHighlight(bookId: string, chapter: number, verse: number) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('highlights')
        .delete()
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .eq('chapter', chapter)
        .eq('verse', verse);
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const key = `highlights_${userId}_${bookId}_${chapter}`;
    const existing = localStorage.getItem(key);
    if (existing) {
      let highlights: Highlight[] = JSON.parse(existing);
      highlights = highlights.filter(h => h.verse !== verse);
      localStorage.setItem(key, JSON.stringify(highlights));
    }
  }
}

// Studies & History
export async function getStudies(): Promise<StudyHistory[]> {
  const userId = getUserId();
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('studies')
        .select('id, title, date')
        .eq('user_id', userId)
        .order('date', { ascending: false });
        
      if (!error && data) return data;
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('biblia_ai_history');
    if (local) return JSON.parse(local);
  }
  return [];
}

export async function saveStudy(study: StudyHistory) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('studies')
        .upsert({ 
          id: study.id,
          user_id: userId, 
          title: study.title,
          date: study.date,
          updated_at: new Date().toISOString()
        });
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const existing = localStorage.getItem('biblia_ai_history');
    let history: StudyHistory[] = existing ? JSON.parse(existing) : [];
    history = history.filter(h => h.id !== study.id);
    history.unshift(study);
    localStorage.setItem('biblia_ai_history', JSON.stringify(history.slice(0, 50)));
  }
}

export async function deleteStudy(id: string) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('studies')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
        
      // Also delete messages
      await supabase
        .from('study_messages')
        .delete()
        .eq('study_id', id);
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const existing = localStorage.getItem('biblia_ai_history');
    if (existing) {
      let history: StudyHistory[] = JSON.parse(existing);
      history = history.filter(h => h.id !== id);
      localStorage.setItem('biblia_ai_history', JSON.stringify(history));
    }
    localStorage.removeItem(`study_messages_${id}`);
  }
}

export async function updateStudyTitle(id: string, title: string) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('studies')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const existing = localStorage.getItem('biblia_ai_history');
    if (existing) {
      let history: StudyHistory[] = JSON.parse(existing);
      const idx = history.findIndex(h => h.id === id);
      if (idx >= 0) {
        history[idx].title = title;
        localStorage.setItem('biblia_ai_history', JSON.stringify(history));
      }
    }
  }
}

export async function getStudyMessages(studyId: string): Promise<Message[]> {
  const userId = getUserId();
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('study_messages')
        .select('role, content')
        .eq('study_id', studyId)
        .order('created_at', { ascending: true });
        
      if (!error && data) {
        return data.map(m => ({
          role: m.role as 'user' | 'model',
          parts: [{ text: m.content }]
        }));
      }
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem(`study_messages_${studyId}`);
    if (local) return JSON.parse(local);
  }
  return [];
}

export async function saveStudyMessage(studyId: string, message: Message) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('study_messages')
        .insert({ 
          study_id: studyId,
          role: message.role,
          content: message.parts[0].text,
          created_at: new Date().toISOString()
        });
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    const key = `study_messages_${studyId}`;
    const existing = localStorage.getItem(key);
    let messages: Message[] = existing ? JSON.parse(existing) : [];
    messages.push(message);
    localStorage.setItem(key, JSON.stringify(messages));
  }
}

// Goals
export async function getGoals(): Promise<string> {
  const userId = getUserId();
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_goals')
        .select('goals')
        .eq('user_id', userId)
        .single();
        
      if (!error && data) return data.goals;
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    return localStorage.getItem('biblia_ai_goals') || '';
  }
  return '';
}

export async function saveGoals(goals: string) {
  const userId = getUserId();
  
  if (supabase) {
    try {
      await supabase
        .from('user_goals')
        .upsert({ 
          user_id: userId, 
          goals,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    } catch (e) {
      console.error('Supabase error', e);
    }
  }
  
  if (typeof window !== 'undefined') {
    localStorage.setItem('biblia_ai_goals', goals);
  }
}
