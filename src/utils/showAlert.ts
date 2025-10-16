import { Alert } from 'react-native';

export const showAlert = (title: string, message: string) => {
  if (typeof Alert.alert === 'function') {
    Alert.alert(title, message);
  } else {
    console.error(`[ThreadForge] ${title}: ${message}`);
  }
};
