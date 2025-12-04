'use client';

import { ArrowLeft, Loader2, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// 我把 type 引用合并到了这里，并且按字母顺序调整了库的位置
import {
  type ComponentType,
  type ReactNode,
  isValidElement,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createNote } from '@/lib/client/notes.client';

import { NotesStandaloneLayout } from '../NotesStandaloneLayout';

export default function NewNotePageClient() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ReactMarkdown: ComponentType<any>;
    remarkGfm: unknown;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([import('react-markdown'), import('remark-gfm')])
      .then(([md, gfm]) => {
        if (!mounted) return;
        setMarkdown({
          ReactMarkdown: md.default,
          remarkGfm: gfm.default,
        });
      })
      .catch(() => {
        setError('Markdown 组件加载失败');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const note = await createNote({ title, content });
      router.replace(`/notes/${note.id}`);
    } catch (err) {
      setError((err as Error).message || '保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: { children: ReactNode[] }) => {
        const child = Array.isArray(children) ? children[0] : null;
        const href =
          isValidElement(child) && typeof child.props?.href === 'string'
            ? child.props.href
            : null;
        const isMp4 = href ? /\.mp4($|[?#])/i.test(href) : false;

        if (
          isMp4 &&
          Array.isArray(children) &&
          children.length === 1 &&
          isValidElement(child)
        ) {
          return (
            <div className='my-4 overflow-hidden rounded-2xl border border-gray-200 bg-black shadow-sm dark:border-gray-700'>
              <video controls className='h-auto w-full' src={href ?? ''}>
                您的浏览器不支持视频播放
              </video>
            </div>
          );
        }

        return <p>{children}</p>;
      },
    }),
    []
  );

  const headerActions = (
    <div className='flex items-center gap-3'>
      <Link
        href='/notes'
        className='inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-base text-gray-600 hover:border-orange-200 hover:text-orange-600 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:border-orange-500/50 dark:hover:text-orange-400'
      >
        <ArrowLeft className='w-4 h-4' />
        返回列表
      </Link>
      <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100 sm:text-2xl'>
        新建笔记
      </h1>
    </div>
  );

  return (
    <NotesStandaloneLayout leftSlot={headerActions}>
      <form
        onSubmit={handleCreate}
        className='grid gap-6 lg:grid-cols-2 lg:items-start'
      >
        <div className='space-y-4'>
          <div>
            <label className='mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200'>
              标题
            </label>
            <input
              type='text'
              className='w-full rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-base text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'
              placeholder='例如：灵感记录...'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200'>
              正文（支持 Markdown）
            </label>
            <textarea
              className='w-full min-h-[360px] rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-base text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'
              placeholder='记录想法，支持 *强调*、`代码`、列表等语法。'
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {error && (
            <p className='text-sm text-red-500 dark:text-red-400'>{error}</p>
          )}

          <button
            type='submit'
            disabled={isSaving}
            className='inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-3 text-white font-medium shadow-lg shadow-orange-500/30 hover:bg-orange-700 transition-colors disabled:opacity-60'
          >
            {isSaving ? (
              <>
                <Loader2 className='w-4 h-4 animate-spin' />
                保存中...
              </>
            ) : (
              <>
                <SquarePen className='w-4 h-4' />
                保存笔记
              </>
            )}
          </button>
        </div>

        <div className='rounded-3xl border border-gray-100 bg-white/70 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/60'>
          <p className='mb-4 text-sm font-medium text-gray-500 dark:text-gray-400'>
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
                输入正文即可在此查看 Markdown 预览。
              </p>
            )}
          </div>
        </div>
      </form>
    </NotesStandaloneLayout>
  );
}
