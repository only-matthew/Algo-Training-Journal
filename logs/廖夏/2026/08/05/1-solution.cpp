#include<iostream>
#include<string>
using namespace std;
 
int count(const string &s){
    int res = 1;
    char repeat = s[0];
    for (int i = 1; i < s.length(); i++){
        if(repeat == s[i]) continue;
        else repeat = s[i], res++;
    }
    return res;
}
 
int main(){
    ios::sync_with_stdio(false);
    cin.tie(0);
    cout.tie(0);
    int t; cin >> t;
    while (t--){
        int n;
        string a; cin >> n >> a;
        bool can_1 = false, can_2 = false;
        for (int i = 1; i < n - 1; i++){
            if (a[i - 1] == a[i + 1] && a[i] != a[i - 1]){can_2 = true; break;}
            if (a[i - 1] != a[i] && a[i + 1] != a[i] && a[i - 1] != a[i + 1]) can_1 = true;
        }
        if (can_2) cout << count(a) - 2;
        else if (can_1) cout << count(a) - 1;
        else cout << count(a);
        cout << endl;
    }
}