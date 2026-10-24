import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "../components" as Island

Item {
    id: page
    property var island
    property var tasks: []
    readonly property int doneCount: tasks.filter(task => task.done).length

    function reload() {
        if (island)
            tasks = island.readTasks();
    }

    function addTask() {
        if (!island)
            return;
        island.addTask(taskInput.text);
        taskInput.clear();
    }

    Component.onCompleted: reload()
    onIslandChanged: reload()

    Connections {
        target: island
        function onTaskRevisionChanged() { page.reload(); }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            Text {
                text: "Tasks"
                color: "#f3f3f5"
                font.pixelSize: 19
                font.weight: Font.DemiBold
            }
            Item { Layout.fillWidth: true }
            Text {
                text: page.doneCount + "/" + page.tasks.length + " done"
                color: "#92939a"
                font.pixelSize: 11
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 7
            QQC2.TextField {
                id: taskInput
                Layout.fillWidth: true
                height: 30
                placeholderText: "Add a task"
                color: "#f3f3f5"
                font.pixelSize: 12
                background: Rectangle {
                    radius: 10
                    color: "#111215"
                    border.color: taskInput.activeFocus ? "#ff9f43" : "#22242a"
                }
                onAccepted: page.addTask()
            }
            Island.PillButton {
                id: addButton
                text: "Add"
                iconName: "list-add"
                enabled: taskInput.text.trim().length > 0
                onClicked: page.addTask()
            }
        }

        ListView {
            id: taskList
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 5
            model: page.tasks
            QQC2.ScrollBar.vertical: QQC2.ScrollBar { }

            delegate: Rectangle {
                required property int index
                required property var modelData
                width: taskList.width
                height: 30
                radius: 9
                color: modelData.done ? "#0a2419" : "#121317"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 9
                    anchors.rightMargin: 4
                    spacing: 8

                    QQC2.CheckBox {
                        id: taskCheck
                        Layout.preferredWidth: 17
                        Layout.preferredHeight: 17
                        implicitWidth: 17
                        implicitHeight: 17
                        leftPadding: 0
                        rightPadding: 0
                        topPadding: 0
                        bottomPadding: 0
                        contentItem: Item { }
                        checked: modelData.done
                        Accessible.name: (checked ? "Mark incomplete: " : "Mark complete: ") + modelData.text
                        indicator: Rectangle {
                            x: (taskCheck.width - width) / 2
                            y: (taskCheck.height - height) / 2
                            width: 17
                            height: 17
                            radius: 8.5
                            color: taskCheck.checked ? "#35cc8a" : "#25272d"
                            border.width: taskCheck.activeFocus ? 2 : 1
                            border.color: taskCheck.activeFocus ? "#f3f3f5" : taskCheck.checked ? "#35cc8a" : "#565861"
                            Text {
                                anchors.centerIn: parent
                                text: taskCheck.checked ? "✓" : ""
                                color: "#092118"
                                font.pixelSize: 12
                                font.weight: Font.Bold
                            }
                        }
                        background: Item { }
                        onToggled: island.setTaskDone(index, checked)
                    }

                    Text {
                        Layout.fillWidth: true
                        text: modelData.text
                        color: modelData.done ? "#a1a5a5" : "#e8e8eb"
                        font.pixelSize: 12
                        font.strikeout: modelData.done
                        elide: Text.ElideRight
                    }

                    QQC2.ToolButton {
                        Layout.preferredWidth: 27
                        Layout.preferredHeight: 27
                        icon.name: "edit-delete"
                        icon.color: "#9da0a7"
                        onClicked: island.deleteTask(index)
                        Accessible.name: "Delete task"
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: page.tasks.length === 0
                text: "Your task list is clear."
                color: "#92939a"
                font.pixelSize: 12
            }
        }
    }
}
