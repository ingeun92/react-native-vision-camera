/* eslint-disable @typescript-eslint/no-explicit-any */
export type Routes = {
  PermissionsPage: undefined;
  CameraPage: undefined;
  MediaPage: {
    path: string;
    type: 'video' | 'photo';
    metaInfo: any;
  };
};
