/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-shadow */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable react-native/no-inline-styles */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, ImageBackground, Text, ScrollView, ActivityIndicator, PermissionsAndroid, Platform } from 'react-native';
import Video, { LoadError, OnLoadData } from 'react-native-video';
import { SAFE_AREA_PADDING } from './Constants';
import { useIsForeground } from './hooks/useIsForeground';
import { PressableOpacity } from 'react-native-pressable-opacity';
import IonIcon from 'react-native-vector-icons/Ionicons';
import { Alert } from 'react-native';
import CameraRoll from '@react-native-community/cameraroll';
import { StatusBarBlurBackground } from './views/StatusBarBlurBackground';
import type { NativeSyntheticEvent } from 'react-native';
import type { ImageLoadEventData } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Routes } from './Routes';
import { useIsFocused } from '@react-navigation/core';

import Geolocation from 'react-native-geolocation-service';
import NaverMapView, { Marker } from 'react-native-nmap';

import DeviceInfo from 'react-native-device-info';

import axios from 'axios';
import Config from 'react-native-config';

const requestSavePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (permission == null) return false;
  let hasPermission = await PermissionsAndroid.check(permission);
  if (!hasPermission) {
    const permissionRequestResult = await PermissionsAndroid.request(permission);
    hasPermission = permissionRequestResult === 'granted';
  }
  return hasPermission;
};

const isVideoOnLoadEvent = (event: OnLoadData | NativeSyntheticEvent<ImageLoadEventData>): event is OnLoadData =>
  'duration' in event && 'naturalSize' in event;

type Props = NativeStackScreenProps<Routes, 'MediaPage'>;
export function MediaPage({ navigation, route }: Props): React.ReactElement {
  const { path, type, metaInfo } = route.params;
  const [hasMediaLoaded, setHasMediaLoaded] = useState(false);
  const isForeground = useIsForeground();
  const isScreenFocused = useIsFocused();
  const isVideoPaused = !isForeground || !isScreenFocused;
  const [savingState, setSavingState] = useState<'none' | 'saving' | 'saved'>('none');

  const [location, setLocation] = useState<ILocation | any>(undefined);
  const [enableMetadataView, setEnableMetaDataView] = useState(false);

  const [uniqueId, setUniqueId] = useState<string>('');
  const [hash, setHash] = useState<string>('0xhash');
  const [signature, setSignature] = useState<string>('0xsig');

  const onMediaLoad = useCallback((event: OnLoadData | NativeSyntheticEvent<ImageLoadEventData>) => {
    if (isVideoOnLoadEvent(event)) {
      console.log(
        `Video loaded. Size: ${event.naturalSize.width}x${event.naturalSize.height} (${event.naturalSize.orientation}, ${event.duration} seconds)`,
      );
    } else {
      console.log(`Image loaded. Size: ${event.nativeEvent.source.width}x${event.nativeEvent.source.height}`);
    }
  }, []);
  const onMediaLoadEnd = useCallback(() => {
    console.log('media has loaded.');
    setHasMediaLoaded(true);
  }, []);
  const onMediaLoadError = useCallback((error: LoadError) => {
    console.log(`failed to load media: ${JSON.stringify(error)}`);
  }, []);

  const onSavePressed = useCallback(async () => {
    try {
      setSavingState('saving');

      const hasPermission = await requestSavePermission();
      if (!hasPermission) {
        Alert.alert('Permission denied!', 'NFTCamera does not have permission to save the media to your camera roll.');
        return;
      }
      await CameraRoll.save(`file://${path}`, {
        type: type,
      });
      setSavingState('saved');
    } catch (e) {
      const message = e instanceof Error ? e.message : JSON.stringify(e);
      setSavingState('none');
      Alert.alert('Failed to save!', `An unexpected error occured while trying to save your ${type}. ${message}`);
    }
  }, [path, type]);

  const source = useMemo(() => ({ uri: `file://${path}` }), [path]);

  const screenStyle = useMemo(() => ({ opacity: hasMediaLoaded ? 1 : 0 }), [hasMediaLoaded]);

  interface ILocation {
    latitude: number;
    longitude: number;
  }

  interface exif {
    width: number;
    height: number;
    dpiWidth: number;
    dpiHeight: number;
    model: string;
    software: string;
    dateTime: string;
    lensModel: string;
  }

  interface verification {
    service: string;
    mediaHash: string;
    uuid: string;
    dateTime: string;
    latitude: number;
    longitude: number;
    signature: string;
  }

  interface sendData {
    name: string;
    description: string;
    image: string;
    attributes: Array<{
      trait_type: string;
      value: string;
    }>;
    exif: exif;
    verification: verification;
    userPk: unknown;
    contractAddress: unknown;
  }

  const getUuid = async (): Promise<void> => {
    const uuid = await DeviceInfo.getUniqueId();
    setUniqueId(uuid);
  };

  const mintPicture = async (): Promise<void> => {
    getUuid();
    const sendData: sendData = {
      name: 'Test220726',
      description: 'Test NFT for NFTCamera',
      image: path,
      attributes: [
        { trait_type: 'Level', value: '5' },
        { trait_type: 'Str', value: '500' },
      ],
      exif: {
        width: metaInfo.width,
        height: metaInfo.height,
        dpiWidth: metaInfo.metadata.DPIWidth,
        dpiHeight: metaInfo.metadata.DPIHeight,
        model: metaInfo.metadata['{TIFF}'].Model,
        software: metaInfo.metadata['{TIFF}'].Software,
        dateTime: metaInfo.metadata['{TIFF}'].DateTime,
        lensModel: metaInfo.metadata['{Exif}'].LensModel,
      },
      verification: {
        service: 'B-Square Lab',
        mediaHash: hash,
        uuid: uniqueId,
        dateTime: new Date().toLocaleString(),
        latitude: location.latitude,
        longitude: location.longitude,
        signature: signature,
      },
      // TODO: Remove from .env
      // TODO: Using ethers.js to make userPk
      userPk: Config.USER_PK,
      contractAddress: Config.CONTRACT_ADDRESS,
    };

    try {
      await axios.post(
        'https://test-besu.bsquarelab.com/besu/mintNFT',
        // "http://localhost:3000/besu/mintNFT",
        sendData,
      );

      Alert.alert('Minting was successful!');
    } catch (error: any) {
      console.log(error.message);
      Alert.alert('Minting failed!');
    }
  };

  useEffect(() => {
    if (Platform.OS === 'ios') Geolocation.requestAuthorization('always');

    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({
          latitude,
          longitude,
        });
      },
      (error) => {
        console.log(error.code, error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []);

  return (
    <View style={[styles.container, screenStyle]}>
      {type === 'photo' && (
        //<Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={onMediaLoadEnd} onLoad={onMediaLoad} />

        <ImageBackground source={source} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={onMediaLoadEnd} onLoad={onMediaLoad}>
          {enableMetadataView && (
            <>
              <ScrollView style={styles.scrollView}>
                <Text style={styles.metaInfo}>
                  width : "{JSON.stringify(metaInfo.width)}" {'\n'}
                  height : "{JSON.stringify(metaInfo.height)}" {'\n'}
                  path : "{JSON.stringify(path)}" {'\n'}
                  dpiWidth : "{JSON.stringify(metaInfo.metadata.DPIWidth)}" {'\n'}
                  dpiHeight : "{JSON.stringify(metaInfo.metadata.DPIHeight)}" {'\n'}
                  model : {JSON.stringify(metaInfo.metadata['{TIFF}'].Model)} {'\n'}
                  software : {JSON.stringify(metaInfo.metadata['{TIFF}'].Software)} {'\n'}
                  dateTime : {JSON.stringify(metaInfo.metadata['{TIFF}'].DateTime)} {'\n'}
                  lensModel : {JSON.stringify(metaInfo.metadata['{Exif}'].LensModel)}
                </Text>
                <Text style={styles.deviceInfo}>
                  service : {'B-Square Lab'} {'\n'}
                  mediaHash : {hash} {'\n'}
                  uuid : {uniqueId} {'\n'}
                  dateTime : {new Date().toLocaleString()} {'\n'}
                  {location != null && (
                    <>
                      latitude : {location.latitude} {'\n'}
                      longitude : {location.longitude} {'\n'}
                    </>
                  )}
                  signature : {signature}
                </Text>
              </ScrollView>
              <NaverMapView style={{ width: '100%', height: '45%' }} showsMyLocationButton={true} center={{ ...location, zoom: 16 }}>
                <Marker coordinate={location} />
              </NaverMapView>
            </>
          )}

          {/* <NaverMapView style={{width: '100%', height: '100%'}}
                        showsMyLocationButton={true}
                        center={{...P0, zoom: 16}}
                        onTouch={e => console.warn('onTouch', JSON.stringify(e.nativeEvent))}
                        onCameraChange={e => console.warn('onCameraChange', JSON.stringify(e))}
                        onMapClick={e => console.warn('onMapClick', JSON.stringify(e))}>
              <Marker coordinate={P0} onClick={() => console.warn('onClick! p0')}/>
              <Marker coordinate={P1} pinColor="blue" onClick={() => console.warn('onClick! p1')}/>
              <Marker coordinate={P2} pinColor="red" onClick={() => console.warn('onClick! p2')}/>
              <Path coordinates={[P0, P1]} onClick={() => console.warn('onClick! path')} width={10}/>
              <Polyline coordinates={[P1, P2]} onClick={() => console.warn('onClick! polyline')}/>
              <Circle coordinate={P0} color={"rgba(255,0,0,0.3)"} radius={200} onClick={() => console.warn('onClick! circle')}/>
              <Polygon coordinates={[P0, P1, P2]} color={`rgba(0, 0, 0, 0.5)`} onClick={() => console.warn('onClick! polygon')}/>
          </NaverMapView> */}
        </ImageBackground>
      )}
      {type === 'video' && (
        <Video
          source={source}
          style={StyleSheet.absoluteFill}
          paused={isVideoPaused}
          resizeMode="cover"
          posterResizeMode="cover"
          allowsExternalPlayback={false}
          automaticallyWaitsToMinimizeStalling={false}
          disableFocus={true}
          repeat={true}
          useTextureView={false}
          controls={false}
          playWhenInactive={true}
          ignoreSilentSwitch="ignore"
          onReadyForDisplay={onMediaLoadEnd}
          onLoad={onMediaLoad}
          onError={onMediaLoadError}
        />
      )}

      {!enableMetadataView && (
        <PressableOpacity style={styles.closeButton} onPress={navigation.goBack}>
          <IonIcon name="close" size={35} color="white" style={styles.icon} />
        </PressableOpacity>
      )}

      <PressableOpacity style={styles.mintButton} onPress={mintPicture}>
        <IonIcon name="cloud-done-outline" size={35} color="white" style={styles.icon} />
      </PressableOpacity>

      <PressableOpacity
        style={styles.metadataButton}
        onPress={() => {
          setEnableMetaDataView(!enableMetadataView);
          getUuid();
        }}>
        <IonIcon name="shield-checkmark-outline" size={35} color={enableMetadataView ? 'blue' : 'white'} style={styles.icon} />
      </PressableOpacity>

      {!enableMetadataView && (
        <PressableOpacity style={styles.saveButton} onPress={onSavePressed} disabled={savingState !== 'none'}>
          {savingState === 'none' && <IonIcon name="download" size={35} color="white" style={styles.icon} />}
          {savingState === 'saved' && <IonIcon name="checkmark" size={35} color="white" style={styles.icon} />}
          {savingState === 'saving' && <ActivityIndicator color="white" />}
        </PressableOpacity>
      )}

      <StatusBarBlurBackground />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  closeButton: {
    position: 'absolute',
    top: SAFE_AREA_PADDING.paddingTop,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  saveButton: {
    position: 'absolute',
    bottom: SAFE_AREA_PADDING.paddingBottom,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  scrollView: {
    backgroundColor: 'rgba(59, 59, 59, 0.3)',
  },
  metaInfo: {
    position: 'absolute',
    top: SAFE_AREA_PADDING.paddingTop + 10,
    left: SAFE_AREA_PADDING.paddingLeft,
    backgroundColor: 'rgba(59, 59, 59, 0.6)',
    width: '92%',
    color: 'white',
    fontSize: 13,
    textAlign: 'left',
    paddingLeft: 10,
    paddingTop: 5,
    paddingBottom: 5,
  },
  deviceInfo: {
    position: 'absolute',
    top: SAFE_AREA_PADDING.paddingTop + 240,
    left: SAFE_AREA_PADDING.paddingLeft,
    backgroundColor: 'rgba(59, 59, 59, 0.6)',
    width: '92%',
    color: 'white',
    fontSize: 13,
    textAlign: 'left',
    paddingLeft: 10,
    paddingTop: 5,
    paddingBottom: 5,
  },
  metadataButton: {
    position: 'absolute',
    bottom: SAFE_AREA_PADDING.paddingBottom,
    right: SAFE_AREA_PADDING.paddingRight,
    width: 40,
    height: 40,
  },
  mintButton: {
    position: 'absolute',
    bottom: SAFE_AREA_PADDING.paddingBottom,
    width: 40,
    height: 40,
  },
  icon: {
    textShadowColor: 'black',
    textShadowOffset: {
      height: 0,
      width: 0,
    },
    textShadowRadius: 1,
  },
});
