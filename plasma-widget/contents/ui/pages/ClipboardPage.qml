import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kquickcontrolsaddons as KQuickControlsAddons
import "../components" as Island

Item {
    id: page
    property var island
    property var items: []

    function reload() {
        if (island)
            items = island.readClipboardHistory();
    }

    function removeItem(index) {
        const next = items.slice();
        next.splice(index, 1);
        items = next;
        island.saveClipboardHistory(next);
    }

    Component.onCompleted: reload()
    onIslandChanged: {
        reload();
        if (island && systemClipboard.formats.indexOf("text/plain") >= 0) {
            island.addClipboardText(String(systemClipboard.content || ""));
            reload();
        }
    }

    KQuickControlsAddons.Clipboard {
        id: systemClipboard
        onContentChanged: {
            if (page.island && formats.indexOf("text/plain") >= 0) {
                island.addClipboardText(String(content || ""));
                page.reload();
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 9

        RowLayout {
            Layout.fillWidth: true
            Text {
                text: "Clipboard"
                color: "#f3f3f5"
                font.pixelSize: 19
                font.weight: Font.DemiBold
            }
            Item { Layout.fillWidth: true }
            Text {
                text: "Recent text"
                color: "#92939a"
                font.pixelSize: 11
            }
        }

        ListView {
            id: clipboardList
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 6
            model: page.items
            QQC2.ScrollBar.vertical: QQC2.ScrollBar { }

            delegate: Rectangle {
                required property int index
                required property var modelData
                width: clipboardList.width
                height: 34
                radius: 10
                color: "#141518"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 12
                    anchors.rightMargin: 5
                    spacing: 9

                    Kirigami.Icon {
                        Layout.preferredWidth: 16
                        Layout.preferredHeight: 16
                        source: "edit-copy"
                        color: "#aeb0b7"
                    }

                    Text {
                        Layout.fillWidth: true
                        text: modelData.text
                        color: "#e8e8eb"
                        font.pixelSize: 12
                        elide: Text.ElideRight
                        verticalAlignment: Text.AlignVCenter
                    }

                    QQC2.ToolButton {
                        Layout.preferredWidth: 28
                        Layout.preferredHeight: 28
                        icon.name: "edit-copy"
                        icon.color: "#aeb0b7"
                        onClicked: systemClipboard.content = modelData.text
                        Accessible.name: "Copy text again"
                    }

                    QQC2.ToolButton {
                        Layout.preferredWidth: 28
                        Layout.preferredHeight: 28
                        icon.name: "edit-delete"
                        icon.color: "#aeb0b7"
                        onClicked: page.removeItem(index)
                        Accessible.name: "Delete copied text"
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: page.items.length === 0
                text: "Copy plain text while this page is open."
                color: "#92939a"
                font.pixelSize: 12
            }
        }
    }
}
