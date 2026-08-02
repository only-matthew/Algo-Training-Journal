#include<iostream>
#include<algorithm>
using namespace std;
int a[200010],b[200010];
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n,m;
        cin>>n>>m;
        for(int i=1;i<=n;i++)cin>>a[i];
        for(int i=1;i<=m;i++)cin>>b[i];
        sort(a+1,a+n+1);
        sort(b+1,b+m+1);
        if(n<2*m){
            cout<<"NO"<<'\n';
            continue;
        }
        bool flag=true;
        for(int i=1;i<=m;i++){
            if(!(a[i]<b[i]&&b[i]<a[n-m+i])){
                flag=false;
                break;
            }
        }
        if(flag)cout<<"YES"<<'\n';
        else cout<<"NO"<<'\n';
    }
    return 0;
}