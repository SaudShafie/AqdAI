// utils/networkUtils.ts
import NetInfo from '@react-native-community/netinfo';

export const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true;
  } catch (error) {
    console.log('Error checking network connectivity:', error);
    return false;
  }
};

export const isNetworkConnected = async (): Promise<boolean> => {
  return await checkNetworkConnectivity();
}; 