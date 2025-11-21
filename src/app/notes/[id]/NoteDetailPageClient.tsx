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
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import {
  deleteNote,
  getNoteById,
  NoteItem,
  subscribeToNotes,
  updateNote,
} from '@/lib/notes.client';
import { formatNoteDate } from '@/lib/notes.utils';

import { NotesStandaloneLayout } from '../NotesStandaloneLayout';

// 定义 Markdown 渲染器的类型
type MarkdownRenderer = (props: {
  children?: React.ReactNode;
  remarkPlugins?: unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: Record<string, any>;
}) => JSX.Element;

type RemarkGfm = unknown;

function normalizeRemarkPlugin(mod: unknown): RemarkGfm {
  if (
    mod &&
    typeof mod === 'object' &&
    'default' in (mod as Record<string, unknown>)
  ) {
    const val = (mod as Record<string, unknown>).default;
    return val ?? mod;
  }
  return mod;
}

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
  const [markdown, setMarkdown] = useState<{
    ReactMarkdown: MarkdownRenderer;
    remarkGfm: RemarkGfm;
  } | null>(null);

  // --- 核心修改：拦截链接渲染逻辑 ---
  const markdownComponents = useMemo(
    () => ({
      // 拦截所有链接 (a 标签)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: (props: any) => {
        const { href, children } = props;
        // 判断链接是否是 .mp4 (忽略大小写，支持带参数的url)
        const isMp4 = href ? /\.mp4($|[?#])/i.test(href) : false;

        if (isMp4) {
          return (
            <div className='my-4 overflow-hidden rounded-2xl border border-gray-200 bg-black shadow-sm dark:border-gray-700'>
              {/* 直接渲染 video 标签 */}
              <video controls className='h-auto w-full' preload='metadata'>
                <source src={href} type='video/mp4' />
                <p className='p-4 text-white'>您的浏览器不支持视频播放</p>
              </video>
            </div>
          );
        }

        // 如果不是 mp4，正常渲染链接
        return (
          <a
            {...props}
            target='_blank'
            rel='noopener noreferrer'
            className='text-green-600 hover:underline break-all'
          >
            {children}
          </a>
        );
      },
      // 同时也拦截图片语法 ![](url.mp4)，防止用户误用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      img: (props: any) => {
        const { src, alt } = props;
        const isMp4 = src ? /\.mp4($|[?#])/i.test(src) : false;
        if (isMp4) {
          return (
            <div className='my-4 overflow-hidden rounded-2xl border border-gray-200 bg-black shadow-sm dark:border-gray-700'>
              <video controls className='h-auto w-full' preload='metadata'>
                <source src={src} type='video/mp4' />
              </video>
            </div>
          );
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={src} alt={alt} className='rounded-xl max-w-full' />;
      },
    }),
    []
  );
  // -------------------------------------------

  useEffect(() => {
    let mounted = true;
    Promise.all([import('react-markdown'), import('remark-gfm')])
      .then(([md, gfm]) => {
        if (!mounted) return;
        setMarkdown({
          ReactMarkdown: md.default as unknown as MarkdownRenderer,
          remarkGfm: normalizeRemarkPlugin(gfm),
        });
      })
      .catch(() => {
        setStatus('Markdown 组件加载失败');
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const headerActions = note ? (
    <div className='flex flex-wrap items-center gap-3'>
      <Link
        href='/notes'
        className='inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-base text-gray-600 hover:border-green-200 hover:text-green-600 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:border-green-500/50 dark:hover:text-green-400'
      >
        <ArrowLeft className='w-4 h-4' />
        返回列表
      </Link>
      <button
        type='button'
        onClick={() => setIsEditing((prev) => !prev)}
        className='inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-200 hover:text-green-600 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:border-green-500/50 dark:hover:text-green-400'
      >
        <Edit3 className='w-4 h-4' />
        {isEditing ? '取消编辑' : '编辑'}
      </button>
    </div>
  ) : (
    <Link
      href='/notes'
      className='inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-base text-gray-600 hover:border-green-200 hover:text-green-600 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:border-green-500/50 dark:hover:text-green-400'
    >
      <ArrowLeft className='w-4 h-4' />
      返回列表
    </Link>
  );

  if (!isLoaded) {
    return (
      <NotesStandaloneLayout leftSlot={headerActions}>
        <div className='flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white/80 px-6 py-12 text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400'>
          <Loader2 className='h-6 w-6 animate-spin' />
          <span>加载笔记中...</span>
        </div>
      </NotesStandaloneLayout>
    );
  }

  if (!note) {
    return (
      <NotesStandaloneLayout leftSlot={headerActions}>
        <div className='px-4 py-12 text-center sm:px-8'>
          <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'>
            <WandSparkles className='h-7 w-7' />
          </div>
          <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            未找到该笔记
          </h2>
          <p className='mt-2 text-sm text-gray-500 dark:text-gray-400'>
            可能已经被删除，或尚未创建。
          </p>
        </div>
      </NotesStandaloneLayout>
    );
  }

  return (
    <NotesStandaloneLayout leftSlot={headerActions}>
      <div className='space-y-6'>
        <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-50'>
          {note.title}
        </h1>

        {!isEditing && (
          <div className='rounded-3xl border border-gray-100 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/70'>
            <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4'>
              正文
            </h2>
            <div className='prose max-w-none text-gray-800 dark:prose-invert dark:text-gray-100'>
              {note.content && markdown ? (
                <markdown.ReactMarkdown
                  remarkPlugins={[markdown.remarkGfm]}
                  components={markdownComponents}
                >
                  {note.content}
                </markdown.ReactMarkdown>
              ) : (
                <p className='text-gray-500 dark:text-gray-400'>暂无内容</p>
              )}
            </div>
          </div>
        )}

        {isEditing && (
          <div className='grid gap-6 lg:grid-cols-2 lg:items-start'>
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
                  正文（支持Markdown）
                </label>
                <textarea
                  className='w-full min-h-[280px] rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-base text-gray-900 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-200 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'
                  placeholder='输入视频链接 https://...mp4 即可直接预览播放'
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
                {content && markdown ? (
                  <markdown.ReactMarkdown
                    remarkPlugins={[markdown.remarkGfm]}
                    components={markdownComponents}
                  >
                    {content}
                  </markdown.ReactMarkdown>
                ) : (
                  <p className='text-gray-400 dark:text-gray-500'>
                    输入内容即可预览效果。
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

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

        <div className='flex justify-start'>
          <button
            type='button'
            onClick={handleDelete}
            className='inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10'
          >
            <Trash2 className='w-4 h-4' />
            删除
          </button>
        </div>
      </div>
    </NotesStandaloneLayout>
  );
}
