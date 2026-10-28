import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    QQC2.ComboBox {
        id: themeBox
        Kirigami.FormData.label: "Theme:"
        textRole: "text"
        model: ListModel {
            ListElement { text: "Midnight"; value: "midnight" }
            ListElement { text: "Aero"; value: "aero" }
            ListElement { text: "Aqua"; value: "aqua" }
            ListElement { text: "Yaru"; value: "yaru" }
            ListElement { text: "Graphite"; value: "graphite" }
        }
        currentIndex: {
            for (let index = 0; index < model.count; index++) {
                if (model.get(index).value === cfg_theme)
                    return index;
            }
            return 0;
        }
        onActivated: cfg_theme = model.get(currentIndex).value
    }

    QQC2.CheckBox {
        id: morningBox
        Kirigami.FormData.label: "Daily agenda:"
        text: "Morning briefing at 08:00"
        checked: cfg_morningAgenda
        onToggled: cfg_morningAgenda = checked
    }

    QQC2.CheckBox {
        id: eveningBox
        text: "Evening recap at 17:00"
        checked: cfg_eveningRecap
        onToggled: cfg_eveningRecap = checked
    }

    QQC2.CheckBox {
        id: waterBox
        Kirigami.FormData.label: "Reminders:"
        text: "Drink water every hour, 08:00 to 21:00"
        checked: cfg_waterReminder
        onToggled: cfg_waterReminder = checked
    }

    QQC2.CheckBox {
        id: prayerBox
        text: "Prayer times"
        checked: cfg_prayerReminder
        onToggled: cfg_prayerReminder = checked
    }

    QQC2.TextField {
        id: cityField
        Kirigami.FormData.label: "City, Country:"
        placeholderText: "Jakarta, Indonesia"
        text: cfg_prayerCity
        onTextChanged: cfg_prayerCity = text
    }

    QQC2.ComboBox {
        id: methodBox
        Kirigami.FormData.label: "Prayer method:"
        textRole: "text"
        model: ListModel {
            ListElement { text: "Kemenag"; value: 20 }
            ListElement { text: "MWL"; value: 3 }
            ListElement { text: "ISNA"; value: 2 }
            ListElement { text: "Umm al-Qura"; value: 4 }
        }
        currentIndex: {
            for (let index = 0; index < model.count; index++) {
                if (model.get(index).value === cfg_prayerMethod)
                    return index;
            }
            return 0;
        }
        onActivated: cfg_prayerMethod = model.get(currentIndex).value
    }
}
