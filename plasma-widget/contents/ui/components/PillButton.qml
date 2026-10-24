import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami

QQC2.Button {
    id: control

    property bool selected: false
    property bool accented: false
    property string iconName: ""

    implicitHeight: 30
    implicitWidth: Math.max(54, contentItem.implicitWidth + leftPadding + rightPadding)
    leftPadding: 12
    rightPadding: 12
    topPadding: 4
    bottomPadding: 4

    background: Rectangle {
        radius: height / 2
        color: control.accented ? "#ff9f43"
             : control.selected ? "#282a30"
             : control.down ? "#34363d"
             : control.hovered ? "#202126"
             : "#151619"
        border.width: control.activeFocus ? 2 : control.selected && !control.accented ? 1 : 0
        border.color: control.activeFocus ? "#f4f4f6" : "#3a3c43"
        Behavior on color { ColorAnimation { duration: 120 } }
    }

    contentItem: Row {
        spacing: control.iconName.length > 0 && control.text.length > 0 ? 7 : 0
        anchors.centerIn: parent

        Kirigami.Icon {
            width: 16
            height: 16
            anchors.verticalCenter: parent.verticalCenter
            visible: control.iconName.length > 0
            source: control.iconName
            color: control.accented ? "#171717" : "#f4f4f6"
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter
            visible: control.text.length > 0
            text: control.text
            color: control.accented ? "#171717" : "#f4f4f6"
            font.pixelSize: 12
            font.weight: control.selected || control.accented ? Font.DemiBold : Font.Medium
        }
    }
}
