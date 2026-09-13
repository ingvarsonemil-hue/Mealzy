import { useState } from 'react';
import {
  ActionSheetIOS,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding-context';
import { type DobValidationErrors, validateDobParts } from '@/lib/onboarding';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DateOfBirthScreen() {
  const router = useRouter();
  const { draft, setDobDraft } = useOnboarding();
  const [month, setMonth] = useState<number | null>(draft.dob.month);
  const [day, setDay] = useState(draft.dob.day);
  const [year, setYear] = useState(draft.dob.year);
  const [errors, setErrors] = useState<DobValidationErrors>({});
  const [androidMonthOpen, setAndroidMonthOpen] = useState(false);

  function persist(nextMonth = month, nextDay = day, nextYear = year, isoDate: string | null = null) {
    setDobDraft({ month: nextMonth, day: nextDay, year: nextYear, isoDate });
  }

  function chooseMonth(nextMonth: number) {
    setMonth(nextMonth);
    setErrors((current) => ({ ...current, month: undefined }));
    persist(nextMonth, day, year);
  }

  function openMonthPicker() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...MONTHS], cancelButtonIndex: 0, title: 'Month' },
        (buttonIndex) => {
          if (buttonIndex > 0) chooseMonth(buttonIndex);
        },
      );
    } else {
      setAndroidMonthOpen(true);
    }
  }

  function submit() {
    const result = validateDobParts(month, day, year);
    if (!result.ok) {
      setErrors(result.errors);
      persist();
      return;
    }

    setErrors({});
    persist(month, day, year, result.isoDate);
    if (result.age < 13) router.push('/under-13-eligibility');
    else router.push('/weekly-budget');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.screen}>
        <OnboardingHeader />

        <View style={styles.content}>
          <Text style={styles.title}>When were you born?</Text>
          <Text style={styles.body}>We use your date of birth to make sure{`\n`}Mealzy is appropriate for your age.</Text>

          <View style={styles.fieldsRow}>
            <View style={[styles.fieldWrap, styles.monthWrap]}>
              <Text style={styles.label}>Month</Text>
              <Pressable
                accessibilityRole="button"
                onPress={openMonthPicker}
                style={[styles.input, errors.month && styles.inputError]}>
                <Text style={[styles.inputText, month == null && styles.placeholder]}>
                  {month == null ? 'Month' : MONTHS[month - 1]}
                </Text>
              </Pressable>
              {errors.month ? <Text style={styles.error}>{errors.month}</Text> : null}
            </View>

            <View style={styles.smallFieldWrap}>
              <Text style={styles.label}>Day</Text>
              <TextInput
                accessibilityLabel="Day"
                keyboardType="number-pad"
                maxLength={2}
                value={day}
                onChangeText={(value) => {
                  const numeric = value.replace(/\D/g, '');
                  setDay(numeric);
                  setErrors((current) => ({ ...current, day: undefined }));
                  persist(month, numeric, year);
                  if (numeric.length === 2) Keyboard.dismiss();
                }}
                placeholder="DD"
                placeholderTextColor={BrandColors.muted}
                style={[styles.textInput, errors.day && styles.inputError]}
              />
              {errors.day ? <Text style={styles.error}>{errors.day}</Text> : null}
            </View>

            <View style={styles.yearWrap}>
              <Text style={styles.label}>Year</Text>
              <TextInput
                accessibilityLabel="Year"
                keyboardType="number-pad"
                maxLength={4}
                value={year}
                onChangeText={(value) => {
                  const numeric = value.replace(/\D/g, '');
                  setYear(numeric);
                  setErrors((current) => ({ ...current, year: undefined }));
                  persist(month, day, numeric);
                  if (numeric.length === 4) Keyboard.dismiss();
                }}
                placeholder="YYYY"
                placeholderTextColor={BrandColors.muted}
                style={[styles.textInput, errors.year && styles.inputError]}
              />
              {errors.year ? <Text style={styles.error}>{errors.year}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <OnboardingButton label="Continue" onPress={submit} />
        </View>
      </View>
      </TouchableWithoutFeedback>

      <Modal visible={androidMonthOpen} transparent animationType="slide" onRequestClose={() => setAndroidMonthOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAndroidMonthOpen(false)}>
          <View style={styles.monthSheet}>
            <Text style={styles.sheetTitle}>Month</Text>
            <ScrollView>
              {MONTHS.map((name, index) => (
                <Pressable
                  key={name}
                  style={styles.monthOption}
                  onPress={() => {
                    chooseMonth(index + 1);
                    setAndroidMonthOpen(false);
                  }}>
                  <Text style={styles.monthOptionText}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 12 },
  content: { paddingTop: 84 },
  title: { color: BrandColors.foreground, fontFamily: serif, fontSize: 30, lineHeight: 36 },
  body: { marginTop: 12, color: BrandColors.muted, fontSize: 16, lineHeight: 24 },
  fieldsRow: { marginTop: 24, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  fieldWrap: { minWidth: 0 },
  monthWrap: { flex: 1.45 },
  smallFieldWrap: { flex: 0.8 },
  yearWrap: { flex: 1 },
  label: { color: BrandColors.muted, fontSize: 13, marginBottom: 7 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: 9,
    backgroundColor: BrandColors.white,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  textInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: 9,
    backgroundColor: BrandColors.white,
    paddingHorizontal: 12,
    color: BrandColors.foreground,
    fontSize: 16,
  },
  inputText: { color: BrandColors.foreground, fontSize: 16 },
  placeholder: { color: BrandColors.muted },
  inputError: { borderColor: BrandColors.destructive },
  error: { color: BrandColors.destructive, fontSize: 11, lineHeight: 14, marginTop: 5 },
  footer: { marginTop: 'auto', paddingBottom: 12 },
  modalBackdrop: { flex: 1, backgroundColor: BrandColors.parchment, justifyContent: 'flex-end' },
  monthSheet: { maxHeight: '60%', backgroundColor: BrandColors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 18, paddingBottom: 24 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: BrandColors.foreground, paddingHorizontal: 20, paddingBottom: 8 },
  monthOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BrandColors.hairline },
  monthOptionText: { fontSize: 17, color: BrandColors.foreground },
});
