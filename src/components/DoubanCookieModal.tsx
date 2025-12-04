'use client';

import { Check, Clipboard, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  clearDoubanCookie,
  getDoubanUserId,
  setDoubanCookie,
  syncDoubanCookie,
} from '@/lib/client/douban-auth';

interface DoubanCookieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

type Step = 'login' | 'copy' | 'done';

export default function DoubanCookieModal({
  isOpen,
  onClose,
  onSave,
}: DoubanCookieModalProps) {
  const [step, setStep] = useState<Step>('login');
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cookie, setCookie] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 先从D1同步cookie，再检查状态
      syncDoubanCookie().then(() => {
        setUserId(getDoubanUserId());
        setStep(getDoubanUserId() ? 'done' : 'login');
        setError('');
        setCookie('');
      });
    }
  }, [isOpen]);

  // 打开豆瓣页面
  const openDouban = () => {
    window.open('https://movie.douban.com/mine', '_blank');
    setStep('copy');
  };

  // 从输入中提取cookie（支持直接cookie或cURL命令）
  const extractCookie = (input: string): string | null => {
    const trimmed = input.trim();

    // 如果是cURL命令，提取-b后面的内容
    if (trimmed.includes('curl ')) {
      // 匹配 -b '...' (单引号包裹，内部可能有双引号)
      const singleQuoteMatch = trimmed.match(/-b\s+'([^']+)'/);
      if (singleQuoteMatch) {
        return singleQuoteMatch[1];
      }

      // 匹配 -b "..." (双引号包裹)
      const doubleQuoteMatch = trimmed.match(/-b\s+"([^"]+)"/);
      if (doubleQuoteMatch) {
        return doubleQuoteMatch[1];
      }

      // 匹配 -H 'cookie: ...' 或 -H "cookie: ..."
      const headerMatch = trimmed.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i);
      if (headerMatch) {
        return headerMatch[1];
      }
    }

    // 直接就是cookie字符串
    if (trimmed.includes('=') && !trimmed.includes('curl ')) {
      return trimmed;
    }

    return null;
  };

  // 保存cookie
  const handleSave = async () => {
    if (!cookie.trim()) {
      setError('请粘贴Cookie');
      return;
    }

    const extractedCookie = extractCookie(cookie);
    if (!extractedCookie) {
      setError('无法识别Cookie格式');
      return;
    }

    if (!extractedCookie.includes('dbcl2=')) {
      setError('Cookie中缺少dbcl2字段，请确保已登录并复制完整');
      return;
    }

    setSaving(true);
    try {
      await setDoubanCookie(extractedCookie);
      setUserId(getDoubanUserId());
      setError('');
      setStep('done');

      setTimeout(() => {
        onSave();
      }, 500);
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 从剪贴板粘贴
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setCookie(text.trim());
        setError('');
      }
    } catch {
      setError('无法读取剪贴板，请手动粘贴');
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await clearDoubanCookie();
      setUserId(null);
      setStep('login');
      setError('');
      setCookie('');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
      <div className='w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900'>
        <div className='flex justify-between items-center mb-4'>
          <h3 className='text-xl font-bold text-gray-800 dark:text-white'>
            连接豆瓣账号
          </h3>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {step === 'done' && userId ? (
          // 已登录状态
          <div>
            <div className='mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-center'>
              <Check className='w-12 h-12 mx-auto mb-2 text-orange-500' />
              <p className='text-orange-700 dark:text-orange-300 font-medium'>
                已连接豆瓣账号
              </p>
              <p className='text-sm text-orange-600 dark:text-orange-400'>
                用户ID: {userId}
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={onClose}
                className='flex-1 py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors'
              >
                完成
              </button>
              <button
                onClick={handleClear}
                disabled={saving}
                className='py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50'
              >
                {saving ? '处理中...' : '断开连接'}
              </button>
            </div>
          </div>
        ) : step === 'login' ? (
          // 步骤1：打开豆瓣
          <div>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
              需要连接您的豆瓣账号才能查看想看/在看/看过的影视
            </p>

            <button
              onClick={openDouban}
              className='w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2'
            >
              <ExternalLink className='w-5 h-5' />
              打开豆瓣
            </button>
            <p className='mt-3 text-xs text-gray-500 dark:text-gray-500 text-center'>
              如未登录会自动跳转登录页
            </p>
          </div>
        ) : (
          // 步骤2：复制Cookie
          <div>
            <div className='mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg'>
              <p className='text-sm text-blue-700 dark:text-blue-300 font-medium'>
                请按以下步骤操作：
              </p>
            </div>

            <ol className='text-sm text-gray-600 dark:text-gray-400 space-y-2 mb-4'>
              <li className='flex items-start gap-2'>
                <span className='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                  1
                </span>
                <span>在豆瓣页面登录账号（如已登录跳过此步）</span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                  2
                </span>
                <span>
                  按{' '}
                  <kbd className='px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono'>
                    F12
                  </kbd>{' '}
                  打开开发者工具
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                  3
                </span>
                <span>
                  点击 <span className='font-medium'>Application</span>
                  （应用）标签
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                  4
                </span>
                <span>
                  左侧展开 <span className='font-medium'>Cookies</span> → 点击{' '}
                  <span className='font-medium'>https://movie.douban.com</span>
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                  5
                </span>
                <span>
                  在右侧表格空白处<span className='font-medium'>右键</span> →
                  选择{' '}
                  <span className='font-medium text-blue-600'>
                    "Copy all as cURL (bash)"
                  </span>
                </span>
              </li>
            </ol>

            <div className='mb-3'>
              <div className='flex items-center justify-between mb-1'>
                <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  粘贴复制的内容
                </label>
                <button
                  onClick={pasteFromClipboard}
                  className='text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1'
                >
                  <Clipboard className='w-3 h-3' />
                  从剪贴板粘贴
                </button>
              </div>
              <textarea
                value={cookie}
                onChange={(e) => {
                  setCookie(e.target.value);
                  setError('');
                }}
                placeholder='粘贴Cookie内容或完整的cURL命令...'
                className='w-full h-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
            </div>

            {error && (
              <p className='mb-3 text-sm text-red-500 text-center'>{error}</p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className='w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50'
            >
              {saving ? '保存中...' : '保存'}
            </button>

            <button
              onClick={() => setStep('login')}
              className='w-full mt-2 py-2 px-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm'
            >
              返回上一步
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
