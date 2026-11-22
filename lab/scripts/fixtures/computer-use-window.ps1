Add-Type -AssemblyName System.Windows.Forms
$form = [Windows.Forms.Form]::new()
$form.Text = $env:AGENT_LAB_FIXTURE_TITLE
$form.Width = 400
$form.Height = 210
$form.ShowInTaskbar = $false
$field = [Windows.Forms.TextBox]::new()
$field.AccessibleName = 'Messaggio di prova'
$field.SetBounds(25, 25, 310, 36)
$button = [Windows.Forms.Button]::new()
$button.SetBounds(25, 75, 180, 36)
$button.Text = 'Registra valore'
$button.Add_Click({
  [IO.File]::WriteAllText($env:AGENT_LAB_FIXTURE_RECEIPT, $field.Text)
  $button.Text = 'Registrato'
})
$form.Controls.Add($field)
$form.Controls.Add($button)
[Windows.Forms.Application]::Run($form)
