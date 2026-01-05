export type MusicSource =
  | 'fangpi'
  | 'jywav'
  | 'migu'
  | 'netease'
  | 'qq'
  | 'kuwo';

export type MusicTrack = {
  uid: string;
  source: MusicSource;
  displayIndex: number;
  keyword: string;
  songid?: string | number;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  audioUrl: string | null;
  lrc: string | null;
  lrcUrl: string | null;
  detailsLoaded: boolean;
  quality: 'normal' | 'lossless';
};

export type MusicTrackDetail = {
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  audioUrl: string | null;
  lrc: string | null;
  lrcUrl: string | null;
  detailsLoaded: boolean;
  quality: 'normal' | 'lossless';
};

export type RestSongInfo = {
  title: string;
  artist: string;
  album: string;
  coverArt: string | null;
};
