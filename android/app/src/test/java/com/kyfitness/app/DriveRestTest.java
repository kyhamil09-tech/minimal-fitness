package com.kyfitness.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.json.JSONObject;
import org.junit.Test;

/** What the Drive backup may contact, and how its requests and answers are put together. */
public class DriveRestTest {
    @Test
    public void onlyHttpsAddressesOnGoogleApisAreAllowed() {
        assertTrue(DriveRest.allowed("https://www.googleapis.com/drive/v3/files"));
        assertTrue(DriveRest.allowed("https://WWW.GOOGLEAPIS.COM/upload/drive/v3/files?uploadType=multipart"));
        assertFalse(DriveRest.allowed("http://www.googleapis.com/drive/v3/files"));
        assertFalse(DriveRest.allowed("https://drive.google.com/x"));
        assertFalse(DriveRest.allowed("https://www.googleapis.com.evil.example/x"));
        assertFalse(DriveRest.allowed("https://evil.example/www.googleapis.com"));
        assertFalse(DriveRest.allowed("https://www.googleapis.com@evil.example/x"));
        assertFalse(DriveRest.allowed("https://user:pw@www.googleapis.com/x"));
        assertFalse(DriveRest.allowed("ftp://www.googleapis.com/x"));
        assertFalse(DriveRest.allowed(null));
        assertFalse(DriveRest.allowed("not a url"));
    }

    @Test
    public void fileIdsAreChecked() {
        assertTrue(DriveRest.validId("1A2b3C-d_E4f5"));
        assertFalse(DriveRest.validId(null));
        assertFalse(DriveRest.validId("abc"));
        assertFalse(DriveRest.validId("../../etc/passwd"));
        assertFalse(DriveRest.validId("id with space"));
        assertFalse(DriveRest.validId("id?alt=media&x=1"));
    }

    @Test
    public void theUploadGoesToTheHiddenAppFolder() throws Exception {
        JSONObject meta = new JSONObject(DriveRest.metadataJson("ky-fitness-backup-2026-10-11.json"));
        assertEquals("ky-fitness-backup-2026-10-11.json", meta.getString("name"));
        assertEquals("appDataFolder", meta.getJSONArray("parents").getString(0));
        assertEquals(1, meta.getJSONArray("parents").length());
        // A name with quotes cannot break out of the details.
        assertEquals("a\"b", new JSONObject(DriveRest.metadataJson("a\"b")).getString("name"));
    }

    @Test
    public void theMultipartBodyHasTheDetailsThenTheContent() throws Exception {
        String body = DriveRest.multipartBody("BND", "f.json", "application/json", "{\"x\":1}");
        assertTrue(body.startsWith("--BND\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"));
        assertTrue(body.contains("\r\n--BND\r\nContent-Type: application/json\r\n\r\n{\"x\":1}\r\n--BND--"));
        assertTrue(body.endsWith("--BND--"));
    }

    @Test
    public void theFileListIsReadAndRowsWithoutAUsableIdAreDropped() throws Exception {
        String json = "{\"files\":["
            + "{\"id\":\"abcde12345\",\"name\":\"a.json\",\"createdTime\":\"2026-10-11T10:00:00.000Z\",\"size\":\"1234\"},"
            + "{\"id\":\"../bad\",\"name\":\"b.json\"},"
            + "{\"name\":\"no id\"},"
            + "{\"id\":\"zyxwv98765\",\"name\":\"c.json\",\"createdTime\":\"2026-10-10T10:00:00.000Z\"}]}";
        List<DriveRest.DriveFile> files = DriveRest.parseFiles(json);
        assertEquals(2, files.size());
        assertEquals("abcde12345", files.get(0).id);
        assertEquals(1234L, files.get(0).size);
        assertEquals("c.json", files.get(1).name);
        assertEquals(0L, files.get(1).size);
        assertEquals(0, DriveRest.parseFiles("{}").size());
    }

    @Test
    public void googlesReasonForAnErrorIsShown() {
        assertEquals("Drive API has not been used", DriveRest.errorMessage("{\"error\":{\"code\":403,\"message\":\"Drive API has not been used\"}}"));
        assertEquals("plain text", DriveRest.errorMessage("plain text"));
        assertEquals("no details", DriveRest.errorMessage(""));
    }
}
