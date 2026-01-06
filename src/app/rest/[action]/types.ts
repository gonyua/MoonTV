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

export type RestPlaylistInfo = {
  id: string;
  name: string;
  coverArt: string | null;
  songCount: number;
  duration: number;
  created: string | null;
  changed: string | null;
};

export type RestPlaylistEntry = {
  id: string;
  isDir: false;
  title: string;
  artist: string;
  coverArt: string | null;
};

export type RestPlaylistDetail = RestPlaylistInfo & {
  entry: RestPlaylistEntry[];
};
