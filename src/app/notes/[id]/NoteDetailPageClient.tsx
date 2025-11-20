'use client';

import {
  ArrowLeft,
  Edit3,
  Loader2,
  Save,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  deleteNote,
  getNoteById,
  NoteItem,
  subscribeToNotes,
  updateNote,
} from '@/lib/notes.client';
import { formatNoteDate } from '@/lib/notes.utils';

import PageLayout from '@/components/PageLayout';

interface NoteDetailProps {
  noteId: string;
}

export default function NoteDetailPageClient({ noteId }: NoteDetailProps) {
  const router = useRouter();
  const [note, setNote] = useState<NoteItem | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      try {
        const initial = await getNoteById(noteId);
        if (!isActive) return;
        setNote(initial);
        setTitle(initial?.title ?? '');
        setContent(initial?.content ?? '');
      } catch (err) {
        if (!isActive) return;
        setStatus((err as Error).message || '加载笔记失败');
      } finally {
        if (isActive) {
          setIsLoaded(true);
        }
      }
    };

    load();

    const unsubscribe = subscribeToNotes((notes) => {
      const updated = notes.find((item) => item.id === noteId) ?? null;
      if (!isActive) return;
      setNote(updated);
      if (updated) {
        setTitle(updated.title);
        setContent(updated.content);
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [noteId]);

  const handleSave = async () => {
    if (!note) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const updated = await updateNote(note.id, { title, content });
      setNote(updated);
      setIsEditing(false);
      setStatus('保存成功');
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus((err as Error).message || '保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    const confirmed = window.confirm('确定要删除这条笔记吗？此操作不可撤销。');
    if (!confirmed) return;
    try {
      await deleteNote(note.id);
      router.replace('/notes');
    } catch (err) {
      setStatus((err as Error).message || '删除失败，请稍后重试');
    }
  };

  const metadata = useMemo(() => {
    if (!note) return null;
    return [
      { label: '创建时间', value: formatNoteDate(note.createdAt) },
      { label: '最后更新', value: formatNoteDate(note.updatedAt) },
    ];
  }, [note]);

  if (!isLoaded) {
    return (
      <PageLayout activePath='/notes'>
        <div className='px-4 sm:px-10 py-12 flex flex-col items-center gap-4 text-gray-500 dark:text-gray-400'>
          <Loader2 className='w-6 h-6 animate-spin' />
          加载笔记中...
        </div>
      </PageLayout>
    );
  }

  if (!note) {
    return (
      <PageLayout activePath='/notes'>
        <div className='px-4 sm:px-10 py-16 text-center'>
          <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'>
            <WandSparkles className='h-7 w-7' />
          </div>
          <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            未找到该笔记
          </h2>
          <p className='mt-2 text-sm text-gray-500 dark:text-gray-400'>
            可能已经被删除，或尚未创建。
          </p>
          <Link
            href='/notes'
            className='mt-6 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:border-green-200 hover:text-green-600 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:border-green-500/50 dark:hover:text-green-400'
          >
            返回列表
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/notes'>
      <div className='px-4 sm:px-10 py-6 sm:py-10 space-y-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='space-y-2'>
            <Link
              href='/notes'
              className='inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400'
            >
              <ArrowLeft className='w-4 h-4' />
              返回笔记列表
            </Link>
            <h1 className='text-3xl font-bold text-gray-900 dark:text-gray-50'>
              {note.title}
            </h1>
          </div>
          <div className='flex flex-wrap gap-3'>
            <button
              onClick={() => setIsEditing((prev) => !prev)}
              className='inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-200 hover:text-green-600 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:border-green-500/50 dark:hover:text-green-400'
            >
              <Edit3 className='w-4 h-4' />
              {isEditing ? '取消编辑' : '编辑'}
            </button>
            <button
              onClick={handleDelete}
              className='inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10'
            >
              <Trash2 className='w-4 h-4' />
              删除
            </button>
          </div>
        </div>

        {metadata && (
          <div className='grid gap-4 sm:grid-cols-2'>
            {metadata.map((item) => (
              <div
                key={item.label}
                className='rounded-2xl border border-gray-100 bg-white/80 px-5 py-3 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300'
              >
                <p className='text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500'>
                  {item.label}
                </p>
                <p className='mt-1 font-medium text-gray-800 dark:text-gray-100'>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className='rounded-3xl border border-gray-100 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/70'>
          <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4'>
            正文
          </h2>
          <div className='prose max-w-none text-gray-800 dark:prose-invert dark:text-gray-100'>
            {note.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {note.content}
              </ReactMarkdown>
            ) : (
              <p className='text-gray-500 dark:text-gray-400'>暂无内容</p>
            )}
          </div>
        </div>

        {isEditing && (
          <div className='rounded-3xl border border-gray-100 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/70'>
            <div className='grid gap-6 lg:grid-cols-2'>
              <div className='space-y-4'>
                <div>
                  <label className='mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200'>
                    标题
                  </label>
                  <input
                    type='text'
                    className='w-full rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-base text-gray-900 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-200 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className='mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200'>
                    正文（Markdown）
                  </label>
                  <textarea
                    className='w-full min-h-[280px] rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-900 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-200 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
                <div className='flex items-center justify-between gap-3 flex-wrap'>
                  {status && (
                    <span className='text-sm text-green-600 dark:text-green-400'>
                      {status}
                    </span>
                  )}
                  <button
                    type='button'
                    onClick={handleSave}
                    disabled={isSaving}
                    className='inline-flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-white font-medium shadow-lg shadow-green-500/30 hover:bg-green-700 transition-colors disabled:opacity-60'
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className='w-4 h-4 animate-spin' />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save className='w-4 h-4' />
                        保存更改
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <p className='mb-2 text-sm font-medium text-gray-500 dark:text-gray-400'>
                  实时预览
                </p>
                <div className='prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-100'>
                  {content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  ) : (
                    <p className='text-gray-400 dark:text-gray-500'>
                      输入内容即可预览效果。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
